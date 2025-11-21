"""
Generate state- and city-level cost profiles from the program cache.
"""

from __future__ import annotations

import argparse
import csv
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

from constants import REGION_MAP

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = PROJECT_ROOT / "data" / "colleges.db"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data"


STATE_QUERY = """
SELECT
    p."school.state" AS state,
    p."school.region_id" AS region_id,
    COUNT(DISTINCT p."school.name") AS school_count,
    COUNT(DISTINCT p.program_code) AS program_count,
    AVG(p."latest.student.size") AS avg_student_size,
    AVG(p."latest.cost.tuition.in_state") AS avg_in_state_tuition,
    AVG(p."latest.cost.tuition.out_of_state") AS avg_out_state_tuition,
    AVG(p."latest.cost.attendance.academic_year") AS avg_attendance_cost,
    AVG(p.avg_net_price) AS avg_net_price
FROM programs p
WHERE p."school.state" IS NOT NULL
GROUP BY state, region_id
ORDER BY state;
"""

CITY_QUERY = """
SELECT
    p."school.state" AS state,
    p."school.city" AS city,
    p."school.region_id" AS region_id,
    COUNT(DISTINCT p."school.name") AS school_count,
    COUNT(DISTINCT p.program_code) AS program_count,
    AVG(p."latest.student.size") AS avg_student_size,
    AVG(p."latest.cost.tuition.in_state") AS avg_in_state_tuition,
    AVG(p."latest.cost.tuition.out_of_state") AS avg_out_state_tuition,
    AVG(p."latest.cost.attendance.academic_year") AS avg_attendance_cost,
    AVG(p.avg_net_price) AS avg_net_price
FROM programs p
WHERE p."school.state" IS NOT NULL
  AND p."school.city" IS NOT NULL
GROUP BY state, city, region_id
HAVING school_count > 0
ORDER BY state, city
LIMIT :limit;
"""


def fetch_rows(db_path: Path, query: str, **params) -> List[Tuple]:
    if not db_path.exists():
        raise FileNotFoundError(f"Database not found at {db_path}. Run the ETL pipeline first.")

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.execute(query, params)
        rows = cursor.fetchall()
    finally:
        conn.close()
    return rows


def normalize_records(dimension: str, rows: Sequence[Tuple]) -> List[Dict[str, object]]:
    records: List[Dict[str, object]] = []
    for row in rows:
        (
            state,
            city_or_region,
            *_,
        ) = row

        record = _build_record(dimension, row)
        if record:
            records.append(record)
    return records


def _build_record(dimension: str, row: Tuple) -> Dict[str, object]:
    if dimension == "state":
        (
            state,
            region_id,
            school_count,
            program_count,
            avg_student_size,
            avg_in_state,
            avg_out_state,
            avg_attendance,
            avg_net_price,
        ) = row
        return {
            "state": state,
            "region_id": region_id,
            "region_name": REGION_MAP.get(region_id, "Unknown"),
            "school_count": school_count,
            "program_count": program_count,
            "avg_student_size": _round_value(avg_student_size),
            "avg_in_state_tuition": _round_value(avg_in_state),
            "avg_out_of_state_tuition": _round_value(avg_out_state),
            "avg_cost_of_attendance": _round_value(avg_attendance),
            "avg_net_price": _round_value(avg_net_price),
        }

    (
        state,
        city,
        region_id,
        school_count,
        program_count,
        avg_student_size,
        avg_in_state,
        avg_out_state,
        avg_attendance,
        avg_net_price,
    ) = row
    return {
        "state": state,
        "city": city,
        "region_id": region_id,
        "region_name": REGION_MAP.get(region_id, "Unknown"),
        "school_count": school_count,
        "program_count": program_count,
        "avg_student_size": _round_value(avg_student_size),
        "avg_in_state_tuition": _round_value(avg_in_state),
        "avg_out_of_state_tuition": _round_value(avg_out_state),
        "avg_cost_of_attendance": _round_value(avg_attendance),
        "avg_net_price": _round_value(avg_net_price),
    }


def write_json(records: List[Dict[str, object]], path: Path, dimension: str) -> None:
    payload = {
        "dimension": dimension,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "record_count": len(records),
        "records": records,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_csv(records: List[Dict[str, object]], path: Path, dimension: str) -> None:
    if not records:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(records[0].keys()))
        writer.writeheader()
        writer.writerows(records)


def _round_value(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value), 2)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate state/city cost profiles.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="Path to colleges.db.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Directory for output files.")
    parser.add_argument("--city-limit", type=int, default=2000, help="Maximum number of city rows to include.")
    parser.add_argument("--csv", action="store_true", help="Also write CSV versions of the summaries.")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    state_rows = fetch_rows(args.db, STATE_QUERY)
    city_rows = fetch_rows(args.db, CITY_QUERY, limit=args.city_limit)

    state_records = normalize_records("state", state_rows)
    city_records = normalize_records("city", city_rows)

    state_json = args.output_dir / "location_states.json"
    city_json = args.output_dir / "location_cities.json"
    write_json(state_records, state_json, "state")
    write_json(city_records, city_json, "city")

    if args.csv:
        write_csv(state_records, args.output_dir / "location_states.csv", "state")
        write_csv(city_records, args.output_dir / "location_cities.csv", "city")

    print(f"Wrote {len(state_records)} states -> {state_json}")
    print(f"Wrote {len(city_records)} cities -> {city_json}")


if __name__ == "__main__":
    main()


