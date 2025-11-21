"""
Program Decision Engine
-----------------------

This script consumes the program-centric dataset produced by the ETL pipeline
(`data/colleges.db`) and ranks Program-at-Institution records using a composite
algorithm that blends affordability, aid intensity, and regional supply gaps.

It surfaces the top-N opportunities for a given CIP code / credential / region
combination and can be extended to power interactive decision tools.
"""

from __future__ import annotations

import argparse
import logging
import math
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pandas as pd

from constants import CREDENTIAL_MAP, REGION_MAP

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_DB = DATA_DIR / "colleges.db"

logger = logging.getLogger(__name__)


@dataclass
class ProgramFilters:
    cip_prefix: Optional[str] = None
    credential_level: Optional[int] = None
    region_id: Optional[int] = None
    max_net_price: Optional[float] = None
    top_k: int = 15


class ProgramDecisionEngine:
    """
    Loads the cached program dataset and computes opportunity scores that help
    students compare programs across regions, credentials, and price points.
    """

    def __init__(self, db_path: Path = DEFAULT_DB):
        self.db_path = Path(db_path)
        if not self.db_path.exists():
            raise FileNotFoundError(
                f"SQLite cache not found at {self.db_path}. "
                "Run scripts/etl_college_data.py first."
            )
        self._programs = self._load_program_frame()

    def rank_programs(self, filters: ProgramFilters) -> pd.DataFrame:
        df = self._apply_filters(self._programs.copy(), filters)
        if df.empty:
            return df

        df = self._build_feature_space(df)
        df = df.sort_values("program_opportunity_score", ascending=False)
        return df.head(filters.top_k)

    def _load_program_frame(self) -> pd.DataFrame:
        conn = sqlite3.connect(self.db_path)
        try:
            df = pd.read_sql_query("SELECT * FROM programs", conn)
        finally:
            conn.close()

        if df.empty:
            raise ValueError(
                "The programs table is empty. Re-run the ETL pipeline to refresh the cache."
            )

        # Normalize column names we rely on
        if "program_credential.level" in df.columns and "program_credential_level" not in df.columns:
            df = df.rename(columns={"program_credential.level": "program_credential_level"})

        return df

    def _apply_filters(self, df: pd.DataFrame, filters: ProgramFilters) -> pd.DataFrame:
        if filters.cip_prefix:
            df = df[df["program_code"].astype(str).str.startswith(filters.cip_prefix)]

        if filters.credential_level:
            df = df[df["program_credential_level"] == filters.credential_level]

        if filters.region_id:
            df = df[df["school.region_id"] == filters.region_id]

        if filters.max_net_price is not None:
            net_price = self._resolve_net_price(df)
            df = df[net_price <= filters.max_net_price]

        return df

    def _build_feature_space(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()

        df["region_name"] = df["school.region_id"].map(REGION_MAP)
        df["credential_name"] = df["program_credential_level"].map(CREDENTIAL_MAP)

        df["resolved_tuition"] = (
            df["latest.cost.tuition.in_state"].fillna(df["latest.cost.tuition.out_of_state"])
        )

        df["avg_net_price_resolved"] = self._resolve_net_price(df)
        df["scholarship_volatility"] = (
            df.get("scholarship_volatility", pd.Series(0, index=df.index)).fillna(0)
        )
        df["housing_discrepancy_flag"] = df.get("housing_discrepancy_flag", False).fillna(False)

        df["region_program_density"] = (
            df.groupby(["program_code", "school.region_id"])["program_code"].transform("count")
        )

        df["program_supply_gap"] = 1 - self._min_max(df["region_program_density"])
        df["net_price_norm"] = self._min_max(df["avg_net_price_resolved"])
        df["tuition_norm"] = self._min_max(df["resolved_tuition"])

        pell_mean = df["latest.aid.pell_grant_rate"].mean()
        if math.isnan(pell_mean):
            pell_mean = 0.0
        pell = df["latest.aid.pell_grant_rate"].fillna(pell_mean)

        loan_mean = df["latest.aid.federal_loan_rate"].mean()
        if math.isnan(loan_mean):
            loan_mean = 0.0
        loan = df["latest.aid.federal_loan_rate"].fillna(loan_mean)
        loan_norm = self._min_max(loan)

        df["aid_strength_score"] = 0.6 * pell + 0.4 * (1 - loan_norm)
        df["affordability_score"] = (
            0.5 * (1 - df["net_price_norm"])
            + 0.2 * df["scholarship_volatility"]
            + 0.3 * (1 - df["tuition_norm"])
        )

        student_median = df["latest.student.size"].median()
        if math.isnan(student_median):
            student_median = 0.0
        student_size = df["latest.student.size"].fillna(student_median)
        df["scale_preference_score"] = 1 - self._min_max(student_size)
        df["supply_gap_score"] = 0.7 * df["program_supply_gap"] + 0.3 * df["scale_preference_score"]

        df["housing_penalty"] = df["housing_discrepancy_flag"].astype(float) * 0.1

        df["program_opportunity_score"] = (
            0.45 * df["affordability_score"]
            + 0.30 * df["aid_strength_score"]
            + 0.25 * df["supply_gap_score"]
            - df["housing_penalty"]
        )

        return df

    @staticmethod
    def _resolve_net_price(df: pd.DataFrame) -> pd.Series:
        base = df.get("avg_net_price")
        if base is None:
            base = pd.Series([math.nan] * len(df), index=df.index, dtype="float64")
        else:
            base = base.astype(float)

        public = df.get("latest.cost.avg_net_price.public")
        private = df.get("latest.cost.avg_net_price.private")

        if public is not None:
            base = base.fillna(public)
        if private is not None:
            base = base.fillna(private)

        median_value = base.dropna().median()
        if math.isnan(median_value):
            median_value = 0.0
        return base.fillna(median_value)

    @staticmethod
    def _min_max(series: pd.Series) -> pd.Series:
        if series.empty:
            return series
        values = series.astype(float)
        valid = values.dropna()
        if valid.empty:
            return pd.Series(0.5, index=series.index)
        span = valid.max() - valid.min()
        if math.isclose(span, 0.0, rel_tol=1e-9):
            return pd.Series(0.5, index=series.index)
        scaled = (values - valid.min()) / span
        return scaled.fillna(0.5)


def print_rankings(df: pd.DataFrame) -> None:
    print(f"Top {len(df)} program opportunities:\n")
    for rank, (_, row) in enumerate(df.iterrows(), start=1):
        school = row["school.name"]
        city = row.get("school.city", "")
        state = row.get("school.state", "")
        program = row.get("program_title", row.get("program_name", "Unknown Program"))
        credential = row.get("credential_name", "Unknown Credential")
        score = row["program_opportunity_score"]
        net_price = row["avg_net_price_resolved"]
        tuition = row["resolved_tuition"]
        aid_strength = row["aid_strength_score"]
        affordability = row["affordability_score"]
        supply = row["supply_gap_score"]

        print(f"{rank:>2}. {program} ({credential}) @ {school} — {city}, {state}")
        print(
            f"    Region: {row['region_name']} | Opportunity Score: {score:.3f} "
            f"| Aid: {aid_strength:.2f} | Affordability: {affordability:.2f} | Supply Gap: {supply:.2f}"
        )
        print(
            f"    Net Price: ${net_price:,.0f} | Tuition (in-state): ${tuition:,.0f} "
            f"| Scholarship Volatility: {row['scholarship_volatility']:.2f}"
        )
        if row["housing_discrepancy_flag"]:
            print("    ⚠ Housing Reality Check: off-campus estimates appear low.")
        print()


def export_rankings(df: pd.DataFrame, destination: Path) -> None:
    subset = df[
        [
            "program_code",
            "program_title",
            "credential_name",
            "school.name",
            "school.city",
            "school.state",
            "region_name",
            "avg_net_price_resolved",
            "resolved_tuition",
            "aid_strength_score",
            "affordability_score",
            "supply_gap_score",
            "program_opportunity_score",
        ]
    ].rename(
        columns={
            "school.name": "school_name",
            "school.city": "school_city",
            "school.state": "school_state",
        }
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    subset.to_csv(destination, index=False)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Rank program opportunities using the program-centric College Scorecard cache."
    )
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="Path to colleges.db produced by the ETL pipeline.")
    parser.add_argument("--cip", dest="cip_prefix", help="CIP prefix to filter on (e.g., 11.07 for Computer Science).")
    parser.add_argument("--credential", type=int, dest="credential_level", help="Credential level code (1-7).")
    parser.add_argument("--region", type=int, dest="region_id", help="Region ID (1-9) per IPEDS.")
    parser.add_argument("--max-net-price", type=float, dest="max_net_price", help="Ceiling for average net price.")
    parser.add_argument("--top-k", type=int, default=15, help="Number of programs to return (default 15).")
    parser.add_argument("--export", type=Path, help="Optional CSV path to export the ranked results.")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging.")
    return parser


def main() -> None:
    parser = build_arg_parser()
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
    )

    filters = ProgramFilters(
        cip_prefix=args.cip_prefix,
        credential_level=args.credential_level,
        region_id=args.region_id,
        max_net_price=args.max_net_price,
        top_k=args.top_k,
    )

    engine = ProgramDecisionEngine(args.db)
    rankings = engine.rank_programs(filters)

    if rankings.empty:
        print("No programs match the supplied filters. Try broadening your query.")
        return

    print_rankings(rankings)

    if args.export:
        export_rankings(rankings, args.export)
        print(f"\nExported rankings to {args.export}")


if __name__ == "__main__":
    main()


