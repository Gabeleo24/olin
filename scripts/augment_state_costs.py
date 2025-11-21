"""
Backfill synthetic state-level cost-of-living metrics.

When the Teleport API is unavailable we rely on data/teleport_fallback.json.
This helper ensures every U.S. state referenced in STATE_DEFAULT_SLUGS has an
entry by deriving estimates from regional averages.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import Dict, List

from constants import STATE_REGION_MAP
from cost_of_living import SLUG_PRIMARY_STATES, STATE_DEFAULT_SLUGS

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FALLBACK_FILE = PROJECT_ROOT / "data" / "teleport_fallback.json"
TELEPORT_HREF = "https://api.teleport.org/api/urban_areas/slug:{slug}/"

METRIC_KEYS = [
    "cost_index",
    "cost_plus_rent_index",
    "rent_index",
    "groceries_index",
    "restaurant_index",
    "rent_small",
    "rent_large",
    "meal_cost",
    "transit_monthly",
]

DISPLAY_NAMES = {
    "birmingham-al": "Birmingham, Alabama",
    "little-rock": "Little Rock, Arkansas",
    "wilmington-de": "Wilmington, Delaware",
    "portland-me": "Portland, Maine",
    "jackson-ms": "Jackson, Mississippi",
    "billings": "Billings, Montana",
    "fargo": "Fargo, North Dakota",
    "manchester-nh": "Manchester, New Hampshire",
    "newark": "Newark, New Jersey",
    "las-vegas": "Las Vegas, Nevada",
    "burlington-vt": "Burlington, Vermont",
    "charleston-wv": "Charleston, West Virginia",
    "cheyenne": "Cheyenne, Wyoming",
    "sioux-falls": "Sioux Falls, South Dakota",
}


def load_fallback() -> Dict:
    if not FALLBACK_FILE.exists():
        raise FileNotFoundError(f"Fallback file not found at {FALLBACK_FILE}.")
    with FALLBACK_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def compute_region_averages(metrics: Dict[str, Dict[str, float]]) -> Dict[int, Dict[str, float]]:
    region_values: Dict[int, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(list))
    for slug, states in SLUG_PRIMARY_STATES.items():
        data = metrics.get(slug)
        if not data:
            continue
        for state in states:
            region_id = STATE_REGION_MAP.get(state)
            if not region_id:
                continue
            for key in METRIC_KEYS:
                value = data.get(key)
                if value is not None:
                    region_values[region_id][key].append(value)

    region_avgs: Dict[int, Dict[str, float]] = {}
    for region_id, buckets in region_values.items():
        region_avgs[region_id] = {
            key: round(mean(values), 2) if values else None for key, values in buckets.items()
        }
    return region_avgs


def ensure_catalog_entry(catalog: List[Dict], slug: str, display_name: str) -> None:
    existing = {
        item.get("href", "").rstrip("/").split("slug:")[-1]
        for item in catalog
        if isinstance(item, dict) and "href" in item
    }
    if slug in existing:
        return
    catalog.append({"name": display_name, "href": TELEPORT_HREF.format(slug=slug)})


def main() -> None:
    fallback = load_fallback()
    catalog = fallback.setdefault("catalog_data", {}).setdefault("_links", {}).setdefault("ua:item", [])
    metrics = fallback.setdefault("metrics", {})

    region_avgs = compute_region_averages(metrics)
    added = 0

    for state, slug in STATE_DEFAULT_SLUGS.items():
        if slug in metrics:
            continue
        region_id = STATE_REGION_MAP.get(state)
        if not region_id or region_id not in region_avgs:
            continue
        metrics[slug] = region_avgs[region_id].copy()
        display_name = DISPLAY_NAMES.get(slug, slug.replace("-", " ").title())
        ensure_catalog_entry(catalog, slug, display_name)
        added += 1

    FALLBACK_FILE.write_text(json.dumps(fallback, indent=2), encoding="utf-8")
    print(f"Added {added} synthetic fallback entries.")


if __name__ == "__main__":
    main()


