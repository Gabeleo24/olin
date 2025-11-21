"""
Club Data Ingestion Pipeline
----------------------------

Loads student organization rosters from configurable sources (JSON APIs,
manual CSV exports, static payloads) and persists them to the shared
`data/colleges.db` cache alongside the program-centric data.
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
from pathlib import Path
from typing import Iterable, List

from clubs.connectors import build_connector
from clubs.models import ClubRecord

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = PROJECT_ROOT / "config" / "club_sources.json"
EXAMPLE_CONFIG = PROJECT_ROOT / "config" / "club_sources.example.json"
DEFAULT_DB = PROJECT_ROOT / "data" / "colleges.db"

logger = logging.getLogger(__name__)


def load_sources(config_path: Path) -> List[dict]:
    if not config_path.exists():
        if config_path == DEFAULT_CONFIG and EXAMPLE_CONFIG.exists():
            logger.warning(
                "Config %s not found. Falling back to example file %s.",
                config_path,
                EXAMPLE_CONFIG,
            )
            config_path = EXAMPLE_CONFIG
        else:
            raise FileNotFoundError(
                f"Club source config not found at {config_path}. "
                "Create one using config/club_sources.example.json as a template."
            )

    with config_path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    if not isinstance(data, list):
        raise ValueError("Club source config must be a list of source definitions.")
    return data


def collect_records(source_definitions: Iterable[dict]) -> List[ClubRecord]:
    records: List[ClubRecord] = []
    for definition in source_definitions:
        school_meta = {
            "school_name": definition["school_name"],
            "unit_id": definition.get("unit_id"),
            "city": definition.get("city"),
            "state": definition.get("state"),
        }
        source_config = definition["source"]
        connector = build_connector(school_meta, source_config)
        logger.info(
            "Fetching clubs for %s via %s",
            school_meta["school_name"],
            source_config.get("name", source_config.get("type")),
        )
        try:
            clubs = connector.fetch()
        except Exception as exc:
            logger.error("Failed to ingest %s: %s", school_meta["school_name"], exc)
            continue
        logger.info("  Retrieved %d clubs", len(clubs))
        records.extend(clubs)
    return records


def write_to_db(records: List[ClubRecord], db_path: Path, mode: str) -> None:
    if not records:
        logger.warning("No club records to persist.")
        return

    db_path.parent.mkdir(parents=True, exist_ok=True)
    rows = [record.to_row() for record in records]

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS clubs (
            school_name TEXT NOT NULL,
            unit_id INTEGER,
            school_city TEXT,
            school_state TEXT,
            club_name TEXT NOT NULL,
            summary TEXT,
            category TEXT,
            subcategory TEXT,
            tags TEXT,
            membership_size INTEGER,
            meeting_cadence TEXT,
            is_virtual INTEGER,
            contact_email TEXT,
            contact_url TEXT,
            source_name TEXT,
            source_type TEXT,
            ingested_at TEXT NOT NULL
        )
        """
    )

    if mode == "replace":
        cursor.execute("DELETE FROM clubs")

    insert_sql = """
        INSERT INTO clubs (
            school_name, unit_id, school_city, school_state, club_name, summary,
            category, subcategory, tags, membership_size, meeting_cadence,
            is_virtual, contact_email, contact_url, source_name, source_type,
            ingested_at
        ) VALUES (
            :school_name, :unit_id, :school_city, :school_state, :club_name, :summary,
            :category, :subcategory, :tags, :membership_size, :meeting_cadence,
            :is_virtual, :contact_email, :contact_url, :source_name, :source_type,
            :ingested_at
        )
    """

    cursor.executemany(insert_sql, rows)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clubs_school ON clubs (school_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clubs_unit ON clubs (unit_id)")
    conn.commit()
    conn.close()
    logger.info("Persisted %d club records to %s", len(rows), db_path)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Ingest student club data into the college cache.")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="Path to club source config JSON.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="SQLite database path (default data/colleges.db).")
    parser.add_argument(
        "--mode",
        choices=["replace", "append"],
        default="replace",
        help="Whether to replace or append to the existing clubs table.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Fetch and log clubs without writing to the database.")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging.")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
    )

    sources = load_sources(args.config)
    records = collect_records(sources)

    logger.info("Total club records collected: %d", len(records))

    if args.dry_run:
        logger.info("Dry run enabled; skipping database write.")
        return

    write_to_db(records, args.db, args.mode)


if __name__ == "__main__":
    main()


