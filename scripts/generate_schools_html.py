"""
Generate a schools.html snapshot from the program-centric cache.
"""

from __future__ import annotations

import argparse
import html
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Tuple

from constants import REGION_MAP

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = PROJECT_ROOT / "data" / "colleges.db"
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "schools.html"


def fetch_school_rows(db_path: Path, limit: int | None = None) -> List[Tuple]:
    if not db_path.exists():
        raise FileNotFoundError(f"Database not found at {db_path}. Run the ETL pipeline first.")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    query = """
        SELECT
            p."school.name" AS name,
            p."school.city" AS city,
            p."school.state" AS state,
            p."school.region_id" AS region_id,
            COUNT(DISTINCT p.program_code) AS program_count,
            AVG(p."latest.student.size") AS student_size,
            AVG(p."latest.cost.tuition.in_state") AS avg_in_state_tuition,
            AVG(p."latest.cost.tuition.out_of_state") AS avg_out_state_tuition,
            AVG(p.avg_net_price) AS avg_net_price
        FROM programs p
        GROUP BY name, city, state, region_id
        ORDER BY name COLLATE NOCASE
    """

    if limit:
        query += f" LIMIT {int(limit)}"

    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()
    return rows


def render_html(rows: List[Tuple], title: str, generated_at: datetime) -> str:
    head = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{html.escape(title)}</title>
    <style>
        :root {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background-color: #0b1426;
            color: #f4f6fb;
        }}
        body {{
            margin: 2rem;
        }}
        h1 {{
            margin-bottom: 0.25rem;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin-top: 1rem;
        }}
        th, td {{
            padding: 0.5rem 0.75rem;
            border-bottom: 1px solid rgba(255,255,255,0.08);
        }}
        th {{
            text-align: left;
            font-size: 0.9rem;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: #7dd3fc;
        }}
        tr:nth-child(even) td {{
            background-color: rgba(255, 255, 255, 0.02);
        }}
        .muted {{
            color: #94a3b8;
            font-size: 0.85rem;
        }}
    </style>
</head>
<body>
    <h1>{html.escape(title)}</h1>
    <p class="muted">Generated {generated_at.isoformat()} — {len(rows)} institutions.</p>
    <table>
        <thead>
            <tr>
                <th>School</th>
                <th>Location</th>
                <th>Region</th>
                <th>Programs</th>
                <th>Avg Net Price</th>
                <th>In-State Tuition</th>
                <th>Out-of-State Tuition</th>
            </tr>
        </thead>
        <tbody>
"""
    body_rows = []
    for row in rows:
        (
            name,
            city,
            state,
            region_id,
            program_count,
            _student_size,
            avg_in_tuition,
            avg_out_tuition,
            avg_net_price,
        ) = row
        region_name = REGION_MAP.get(region_id, "Unknown")
        body_rows.append(
            f"""            <tr>
                <td>{html.escape(name or "Unknown")}</td>
                <td>{html.escape(f"{city}, {state}".strip(", "))}</td>
                <td>{html.escape(region_name)}</td>
                <td>{program_count or 0}</td>
                <td>${_format_money(avg_net_price)}</td>
                <td>${_format_money(avg_in_tuition)}</td>
                <td>${_format_money(avg_out_tuition)}</td>
            </tr>
"""
        )

    footer = """        </tbody>
    </table>
</body>
</html>
"""
    return head + "".join(body_rows) + footer


def _format_money(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{value:,.0f}"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate an HTML view of schools from the cache.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="Path to colleges.db")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Destination HTML file")
    parser.add_argument("--limit", type=int, help="Limit number of schools for preview purposes")
    parser.add_argument("--title", default="College Program Providers", help="HTML page title")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    rows = fetch_school_rows(args.db, args.limit)
    html_text = render_html(rows, args.title, datetime.now(timezone.utc))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(html_text, encoding="utf-8")
    print(f"Wrote {len(rows)} schools to {args.output}")


if __name__ == "__main__":
    main()


