"""
Cost of Living Ingestion
------------------------

Fetches cost-of-living metrics for major U.S. cities using the Teleport Urban Areas API
and stores the normalized results inside data/colleges.db (location_costs table).
"""

from __future__ import annotations

import logging
import re
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple, Set

import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "data" / "colleges.db"
TELEPORT_ROOT = "https://api.teleport.org/api"
FALLBACK_FILE = PROJECT_ROOT / "data" / "teleport_fallback.json"
LOGGER = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def fetch_urban_area_slugs() -> Dict[str, List[str]]:
    LOGGER.info("Fetching Teleport urban area catalog…")
    try:
        response = requests.get(f"{TELEPORT_ROOT}/urban_areas/", timeout=10)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        LOGGER.warning("Teleport catalog request failed (%s). Using fallback dataset.", exc)
        if not FALLBACK_FILE.exists():
            raise
        data = load_json(FALLBACK_FILE).get("catalog_data", {})
    items = data.get("_links", {}).get("ua:item", [])
    mapping: Dict[str, List[str]] = defaultdict(list)
    for item in items:
        name = item.get("name", "")
        href = item.get("href", "")
        slug = href.rstrip("/").split("slug:")[-1]
        if not slug:
            continue
        normalized = normalize_name(name)
        mapping[normalized].append(slug)
    LOGGER.info("Discovered %d Teleport urban areas.", len(items))
    return mapping


MANUAL_SLUG_OVERRIDES = {
    "newyork": "new-york",
    "washington": "washington-dc",
    "stlouis": "st-louis",
    "saintlouis": "st-louis",
    "sanjose": "san-jose",
    "lasvegas": "las-vegas",
    "losangeles": "los-angeles",
    "sanfrancisco": "san-francisco-bay-area",
    "denver": "denver",
    "phoenix": "phoenix",
    "miami": "miami",
    "austin": "austin",
    "dallas": "dallas",
    "nashville": "nashville",
    "raleigh": "raleigh",
    "pittsburgh": "pittsburgh",
    "minneapolis": "minneapolis",
    "columbus": "columbus",
    "madison": "madison",
    "annarbor": "ann-arbor",
    "gainesville": "gainesville",
    "boulder": "boulder",
    "tucson": "tucson",
    "orlando": "orlando",
    "charlotte": "charlotte",
    "saltlakecity": "salt-lake-city",
    "portland": "portland",
    "sandiego": "san-diego",
    "sacramento": "sacramento",
    "kansascity": "kansas-city",
    "detroit": "detroit",
    "philadelphia": "philadelphia",
    "baltimore": "baltimore",
    "richmond": "richmond",
    "neworleans": "new-orleans",
    "sanantonio": "san-antonio",
    "tampa": "tampa-bay-area",
    "jacksonville": "jacksonville",
    "indianapolis": "indianapolis",
    "cleveland": "cleveland",
    "cincinnati": "cincinnati",
    "milwaukee": "milwaukee",
    "memphis": "memphis",
    "oklahomacity": "oklahoma-city",
    "albuquerque": "albuquerque",
    "boise": "boise",
    "honolulu": "honolulu",
    "anchorage": "anchorage",
    "providence": "providence",
    "hartford": "hartford",
    "buffalo": "buffalo",
    "rochester": "rochester",
    "charleston": "charleston",
    "louisville": "louisville",
    "omaha": "omaha",
    "desmoines": "des-moines",
    "fresno": "fresno",
    "bakersfield": "bakersfield",
    "riverside": "riverside",
    "birmingham": "birmingham-al",
    "littlerock": "little-rock",
    "wilmington": "wilmington-de",
    "lasvegas": "las-vegas",
    "newark": "newark",
    "billings": "billings",
    "fargo": "fargo",
    "manchesternh": "manchester-nh",
    "burlingtonvt": "burlington-vt",
    "charlestonwv": "charleston-wv",
    "cheyenne": "cheyenne",
    "siouxfalls": "sioux-falls",
    "jacksonms": "jackson-ms",
    "portlandme": "portland-me",
}

SLUG_PRIMARY_STATES: Dict[str, Set[str]] = {
    "albuquerque": {"NM"},
    "anchorage": {"AK"},
    "ann-arbor": {"MI"},
    "atlanta": {"GA"},
    "austin": {"TX"},
    "bakersfield": {"CA"},
    "baltimore": {"MD"},
    "billings": {"MT"},
    "birmingham-al": {"AL"},
    "boise": {"ID"},
    "boston": {"MA"},
    "boulder": {"CO"},
    "buffalo": {"NY"},
    "burlington-vt": {"VT"},
    "charleston": {"SC"},
    "charleston-wv": {"WV"},
    "charlotte": {"NC"},
    "cheyenne": {"WY"},
    "chicago": {"IL"},
    "cincinnati": {"OH"},
    "cleveland": {"OH"},
    "columbus": {"OH"},
    "dallas": {"TX"},
    "denver": {"CO"},
    "des-moines": {"IA"},
    "detroit": {"MI"},
    "fargo": {"ND"},
    "fresno": {"CA"},
    "gainesville": {"FL"},
    "hartford": {"CT"},
    "honolulu": {"HI"},
    "houston": {"TX"},
    "indianapolis": {"IN"},
    "jackson-ms": {"MS"},
    "jacksonville": {"FL"},
    "kansas-city": {"KS", "MO"},
    "las-vegas": {"NV"},
    "little-rock": {"AR"},
    "los-angeles": {"CA"},
    "louisville": {"KY"},
    "madison": {"WI"},
    "manchester-nh": {"NH"},
    "memphis": {"TN"},
    "miami": {"FL"},
    "milwaukee": {"WI"},
    "minneapolis": {"MN"},
    "nashville": {"TN"},
    "new-orleans": {"LA"},
    "new-york": {"NY"},
    "newark": {"NJ"},
    "oklahoma-city": {"OK"},
    "omaha": {"NE"},
    "orlando": {"FL"},
    "philadelphia": {"PA"},
    "phoenix": {"AZ"},
    "pittsburgh": {"PA"},
    "portland": {"OR"},
    "portland-me": {"ME"},
    "providence": {"RI"},
    "raleigh": {"NC"},
    "richmond": {"VA"},
    "riverside": {"CA"},
    "rochester": {"NY"},
    "sacramento": {"CA"},
    "salt-lake-city": {"UT"},
    "san-antonio": {"TX"},
    "san-diego": {"CA"},
    "san-francisco-bay-area": {"CA"},
    "seattle": {"WA"},
    "sioux-falls": {"SD"},
    "tampa-bay-area": {"FL"},
    "tucson": {"AZ"},
    "wilmington-de": {"DE"},
    "washington-dc": {"DC"},
    "pago-pago": {"AS"},
    "kolonia": {"FM"},
    "hagatna": {"GU"},
    "majuro": {"MH"},
    "saipan": {"MP"},
    "san-juan": {"PR"},
    "koror": {"PW"},
    "charlotte-amalie": {"VI"},
}

STATE_DEFAULT_SLUGS: Dict[str, str] = {
    "AL": "birmingham-al",
    "AK": "anchorage",
    "AZ": "phoenix",
    "AR": "little-rock",
    "CA": "los-angeles",
    "CO": "denver",
    "CT": "hartford",
    "DE": "wilmington-de",
    "FL": "miami",
    "GA": "atlanta",
    "HI": "honolulu",
    "ID": "boise",
    "IL": "chicago",
    "IN": "indianapolis",
    "IA": "des-moines",
    "KS": "kansas-city",
    "KY": "louisville",
    "LA": "new-orleans",
    "ME": "portland-me",
    "MD": "baltimore",
    "MA": "boston",
    "MI": "detroit",
    "MN": "minneapolis",
    "MS": "jackson-ms",
    "MO": "kansas-city",
    "MT": "billings",
    "NE": "omaha",
    "NV": "las-vegas",
    "NH": "manchester-nh",
    "NJ": "newark",
    "NM": "albuquerque",
    "NY": "new-york",
    "NC": "charlotte",
    "ND": "fargo",
    "OH": "columbus",
    "OK": "oklahoma-city",
    "OR": "portland",
    "PA": "philadelphia",
    "RI": "providence",
    "SC": "charleston",
    "SD": "sioux-falls",
    "TN": "nashville",
    "TX": "houston",
    "UT": "salt-lake-city",
    "VT": "burlington-vt",
    "VA": "richmond",
    "WA": "seattle",
    "WV": "charleston-wv",
    "WI": "milwaukee",
    "WY": "cheyenne",
    "DC": "washington-dc",
    "AS": "pago-pago",
    "FM": "kolonia",
    "GU": "hagatna",
    "MH": "majuro",
    "MP": "saipan",
    "PR": "san-juan",
    "PW": "koror",
    "VI": "charlotte-amalie",
}


def slug_allowed_for_state(slug: str, state: Optional[str]) -> bool:
    if not state:
        return True
    allowed = SLUG_PRIMARY_STATES.get(slug)
    if not allowed:
        return True
    return state in allowed


def resolve_slug(city: str, state: Optional[str], catalog: Dict[str, List[str]]) -> Optional[str]:
    norm_city = normalize_name(city)
    state_code = state.upper() if state else None

    candidate = MANUAL_SLUG_OVERRIDES.get(norm_city)
    if candidate and slug_allowed_for_state(candidate, state):
        return candidate

    if norm_city == "washington" and state_code and state_code != "DC":
        default_slug = STATE_DEFAULT_SLUGS.get(state_code)
        if default_slug:
            return default_slug

    if state_code:
        combo_override = MANUAL_SLUG_OVERRIDES.get(normalize_name(f"{city}-{state_code}"))
        if combo_override and slug_allowed_for_state(combo_override, state):
            return combo_override

    if norm_city in catalog:
        for slug in catalog[norm_city]:
            if slug_allowed_for_state(slug, state):
                return slug

    if state_code:
        combo = normalize_name(f"{city}-{state_code}")
        if combo in catalog:
            for slug in catalog[combo]:
                if slug_allowed_for_state(slug, state):
                    return slug
        default_slug = STATE_DEFAULT_SLUGS.get(state_code)
        if default_slug:
            return default_slug

    return None


def extract_metric(categories: List[dict], category_label: str, item_label: str) -> Optional[float]:
    for category in categories:
        if category.get("label") != category_label:
            continue
        for item in category.get("data", []):
            if item.get("label") == item_label:
                return (
                    item.get("currency_dollar_value")
                    or item.get("float_value")
                    or item.get("int_value")
                )
    return None


def load_json(path: Path) -> dict:
    import json

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def fetch_cost_metrics(slug: str) -> Optional[Tuple[dict, str]]:
    url = f"{TELEPORT_ROOT}/urban_areas/slug:{slug}/details/"
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 404:
            return _load_fallback_metric(slug)
        response.raise_for_status()
        data = response.json()
        categories = data.get("categories", [])
        metrics = {
            "cost_index": extract_metric(categories, "Cost of Living", "Cost of Living Index"),
            "cost_plus_rent_index": extract_metric(categories, "Cost of Living", "Cost of Living Plus Rent Index"),
            "rent_index": extract_metric(categories, "Cost of Living", "Rent Index"),
            "groceries_index": extract_metric(categories, "Cost of Living", "Groceries Index"),
            "restaurant_index": extract_metric(categories, "Cost of Living", "Restaurant Price Index"),
            "rent_small": extract_metric(categories, "Cost of Living", "Apartment (1 bedroom) in City Centre"),
            "rent_large": extract_metric(categories, "Cost of Living", "Apartment (3 bedrooms) in City Centre"),
            "meal_cost": extract_metric(categories, "Cost of Living", "Meal, Inexpensive Restaurant"),
            "transit_monthly": extract_metric(categories, "Cost of Living", "Monthly Pass (Regular Price)"),
        }
        return metrics, "teleport"
    except requests.RequestException as exc:
        LOGGER.warning("Teleport metrics request failed for %s (%s). Checking fallback dataset.", slug, exc)
        return _load_fallback_metric(slug)


def _load_fallback_metric(slug: str) -> Optional[Tuple[dict, str]]:
    if not FALLBACK_FILE.exists():
        return None
    fallback = load_json(FALLBACK_FILE).get("metrics", {}).get(slug)
    if not fallback:
        return None
    source = fallback.get("_source", "fallback")
    metrics = {k: v for k, v in fallback.items() if not k.startswith("_")}
    return metrics, source


def ensure_tables(conn: sqlite3.Connection):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS location_costs (
            city TEXT NOT NULL,
            state TEXT,
            slug TEXT,
            cost_index REAL,
            cost_plus_rent_index REAL,
            rent_index REAL,
            groceries_index REAL,
            restaurant_index REAL,
            rent_small REAL,
            rent_large REAL,
            meal_cost REAL,
            transit_monthly REAL,
            source TEXT,
            last_updated TEXT NOT NULL,
            PRIMARY KEY (city, state)
        )
        """
    )
    conn.commit()
    _ensure_column(conn, "latitude", "REAL")
    _ensure_column(conn, "longitude", "REAL")


def _ensure_column(conn: sqlite3.Connection, name: str, definition: str) -> None:
    try:
        conn.execute(f"ALTER TABLE location_costs ADD COLUMN {name} {definition}")
    except sqlite3.OperationalError as exc:
        if "duplicate column name" not in str(exc).lower():
            raise


def fetch_unique_cities(
    conn: sqlite3.Connection, limit: Optional[int] = None
) -> Iterable[Tuple[str, str, Optional[float], Optional[float]]]:
    query = """
        SELECT
            TRIM("school.city") AS city,
            TRIM("school.state") AS state,
            AVG("location.lat") AS latitude,
            AVG("location.lon") AS longitude
        FROM programs
        WHERE "school.city" IS NOT NULL
          AND "school.state" IS NOT NULL
        GROUP BY city, state
    """
    if limit:
        query += f" LIMIT {int(limit)}"
    cursor = conn.execute(query)
    return [(row[0], row[1], row[2], row[3]) for row in cursor.fetchall()]


def upsert_metric(
    conn: sqlite3.Connection,
    city: str,
    state: str,
    slug: str,
    metrics: dict,
    *,
    latitude: Optional[float],
    longitude: Optional[float],
    source: str,
):
    timestamp = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO location_costs (
            city, state, slug, cost_index, cost_plus_rent_index, rent_index,
            groceries_index, restaurant_index, rent_small, rent_large,
            meal_cost, transit_monthly, latitude, longitude, source, last_updated
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(city, state) DO UPDATE SET
            slug=excluded.slug,
            cost_index=excluded.cost_index,
            cost_plus_rent_index=excluded.cost_plus_rent_index,
            rent_index=excluded.rent_index,
            groceries_index=excluded.groceries_index,
            restaurant_index=excluded.restaurant_index,
            rent_small=excluded.rent_small,
            rent_large=excluded.rent_large,
            meal_cost=excluded.meal_cost,
            transit_monthly=excluded.transit_monthly,
            latitude=COALESCE(excluded.latitude, location_costs.latitude),
            longitude=COALESCE(excluded.longitude, location_costs.longitude),
            source=excluded.source,
            last_updated=excluded.last_updated
        """,
        (
            city,
            state,
            slug,
            metrics.get("cost_index"),
            metrics.get("cost_plus_rent_index"),
            metrics.get("rent_index"),
            metrics.get("groceries_index"),
            metrics.get("restaurant_index"),
            metrics.get("rent_small"),
            metrics.get("rent_large"),
            metrics.get("meal_cost"),
            metrics.get("transit_monthly"),
            latitude,
            longitude,
            source,
            timestamp,
        ),
    )


def main():
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Database not found at {DB_PATH}. Run the ETL first.")
    conn = sqlite3.connect(DB_PATH)
    ensure_tables(conn)
    catalog = fetch_urban_area_slugs()
    cities = fetch_unique_cities(conn)
    LOGGER.info("Evaluating %d unique city/state combinations.", len(cities))

    updated = 0
    missing = 0
    for city, state, latitude, longitude in cities:
        slug = resolve_slug(city, state, catalog)
        if not slug:
            missing += 1
            continue
        metrics_bundle = fetch_cost_metrics(slug)
        if not metrics_bundle:
            missing += 1
            continue
        metrics, source_label = metrics_bundle
        upsert_metric(
            conn,
            city,
            state,
            slug,
            metrics,
            latitude=latitude,
            longitude=longitude,
            source=source_label,
        )
        updated += 1
    conn.commit()
    conn.close()
    LOGGER.info("Updated cost-of-living metrics for %d cities (%d missing data).", updated, missing)


if __name__ == "__main__":
    main()


