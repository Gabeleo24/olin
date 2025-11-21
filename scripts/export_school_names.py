"""
Export School Names
-------------------

Utility script that reads the program-centric SQLite cache produced by
`scripts/etl_college_data.py` and exports a deduplicated list of schools with
optional location metadata.
"""

from __future__ import annotations

import argparse
import csv
import json
import sqlite3
from pathlib import Path
from typing import Iterable, List, Mapping, Sequence

from constants import REGION_MAP

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_DB = DATA_DIR / "colleges.db"


def fetch_school_records(db_path: Path) -> List[Mapping[str, object]]:
    if not db_path.exists():
        raise FileNotFoundError(
            f"SQLite cache not found at {db_path}. "
            "Run scripts/etl_college_data.py to build the data source."
        )

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT DISTINCT
                "school.name" AS name,
                COALESCE("school.city", '') AS city,
                COALESCE("school.state", '') AS state,
                "school.region_id" AS region_id
            FROM programs
            ORDER BY name COLLATE NOCASE
            """
        ).fetchall()
    finally:
        conn.close()

    results: List[Mapping[str, object]] = []
    for row in rows:
        region_id = row["region_id"]
        results.append(
            {
                "name": row["name"],
                "city": row["city"],
                "state": row["state"],
                "region_id": region_id,
                "region_name": REGION_MAP.get(region_id, "Unknown"),
            }
        )
    return results


def export_json(records: Sequence[Mapping[str, object]], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", encoding="utf-8") as fh:
        json.dump(records, fh, indent=2)


def export_csv(records: Sequence[Mapping[str, object]], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["name", "city", "state", "region_id", "region_name"]
    with destination.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)


def print_names(records: Iterable[Mapping[str, object]], limit: int = 50) -> None:
    print(f"Total schools: {len(records)}")
    for record in list(records)[:limit]:
        location = ", ".join(filter(None, [record["city"], record["state"]]))
        region = record["region_name"]
        print(f"- {record['name']} ({location}) [{region}]")
    if len(records) > limit:
        print(f"...and {len(records) - limit} more (use --export to capture them all).")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Export every school name from the program cache.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="Path to colleges.db (default: data/colleges.db).")
    parser.add_argument("--format", choices=["json", "csv"], help="File format for export.")
    parser.add_argument("--output", type=Path, help="Destination file (required if --format is provided).")
    parser.add_argument("--preview", type=int, default=40, help="Number of names to preview in stdout (default 40).")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    records = fetch_school_records(args.db)

    if args.format:
        if not args.output:
            parser.error("--output is required when --format is specified.")
        if args.format == "json":
            export_json(records, args.output)
        else:
            export_csv(records, args.output)
        print(f"Exported {len(records)} schools to {args.output}")
    else:
        print_names(records, limit=args.preview)


if __name__ == "__main__":
    main()


