"""
Utilities to expand the Teleport fallback dataset using cached metrics.

When the live Teleport API is unreachable we fall back to `data/teleport_fallback.json`.
This helper promotes the freshest records from `data/colleges.db::location_costs`
into that fallback file so future ingestions can still cover the same cities.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "data" / "colleges.db"
FALLBACK_FILE = PROJECT_ROOT / "data" / "teleport_fallback.json"
HREF_TEMPLATE = "https://api.teleport.org/api/urban_areas/slug:{slug}/"


@dataclass
class CostRecord:
    city: str
    state: str
    slug: str
    cost_index: float | None
    cost_plus_rent_index: float | None
    rent_index: float | None
    groceries_index: float | None
    restaurant_index: float | None
    rent_small: float | None
    rent_large: float | None
    meal_cost: float | None
    transit_monthly: float | None
    last_updated: str


def load_fallback() -> Dict:
    if FALLBACK_FILE.exists():
        with FALLBACK_FILE.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    return {"catalog_data": {"_links": {"ua:item": []}}, "metrics": {}}


def serialize_fallback(data: Dict) -> None:
    FALLBACK_FILE.write_text(json.dumps(data, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def fetch_latest_cost_records() -> Dict[str, CostRecord]:
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Database not found at {DB_PATH}. Run the ETL before exporting fallback data.")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT
            city,
            state,
            slug,
            cost_index,
            cost_plus_rent_index,
            rent_index,
            groceries_index,
            restaurant_index,
            rent_small,
            rent_large,
            meal_cost,
            transit_monthly,
            last_updated
        FROM location_costs
        WHERE slug IS NOT NULL
        ORDER BY last_updated DESC
        """
    ).fetchall()
    conn.close()

    latest: Dict[str, CostRecord] = {}
    for row in rows:
        slug = row["slug"]
        if not slug or slug in latest:
            continue
        latest[slug] = CostRecord(
            city=row["city"],
            state=row["state"],
            slug=row["slug"],
            cost_index=row["cost_index"],
            cost_plus_rent_index=row["cost_plus_rent_index"],
            rent_index=row["rent_index"],
            groceries_index=row["groceries_index"],
            restaurant_index=row["restaurant_index"],
            rent_small=row["rent_small"],
            rent_large=row["rent_large"],
            meal_cost=row["meal_cost"],
            transit_monthly=row["transit_monthly"],
            last_updated=row["last_updated"],
        )
    return latest


def ensure_catalog_entries(fallback: Dict, records: Dict[str, CostRecord]) -> int:
    catalog = fallback.setdefault("catalog_data", {}).setdefault("_links", {}).setdefault("ua:item", [])
    existing_slugs = {
        item.get("href", "").rstrip("/").split("slug:")[-1]
        for item in catalog
        if isinstance(item, dict) and "href" in item
    }
    added = 0
    for slug, record in records.items():
        if slug in existing_slugs:
            continue
        city_name = record.city or slug.replace("-", " ").title()
        catalog.append({"name": city_name, "href": HREF_TEMPLATE.format(slug=slug)})
        existing_slugs.add(slug)
        added += 1
    return added


def update_metrics(fallback: Dict, records: Dict[str, CostRecord]) -> None:
    metrics = fallback.setdefault("metrics", {})
    for slug, record in records.items():
        metrics[slug] = {
            "cost_index": record.cost_index,
            "cost_plus_rent_index": record.cost_plus_rent_index,
            "rent_index": record.rent_index,
            "groceries_index": record.groceries_index,
            "restaurant_index": record.restaurant_index,
            "rent_small": record.rent_small,
            "rent_large": record.rent_large,
            "meal_cost": record.meal_cost,
            "transit_monthly": record.transit_monthly,
        }


def main():
    records = fetch_latest_cost_records()
    fallback = load_fallback()
    added_catalog = ensure_catalog_entries(fallback, records)
    update_metrics(fallback, records)
    serialize_fallback(fallback)
    print(f"Exported {len(records)} slugs into fallback (added {added_catalog} new catalog entries).")


if __name__ == "__main__":
    main()


