from __future__ import annotations

import json
import math
import os
import sqlite3
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional

import requests
from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Response,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from pydantic import BaseModel, Field

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = PROJECT_ROOT / "data" / "colleges.db"

EARTH_RADIUS_MILES = 3958.8
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "profiles")
SUPABASE_PUBLIC_BUCKET_URL = os.getenv(
    "SUPABASE_STORAGE_PUBLIC_URL",
    f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}"
    if SUPABASE_URL
    else None,
)
UPLOAD_RATE_LIMIT = 10
UPLOAD_RATE_WINDOW = 60  # seconds

PROFILE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id TEXT,
    name TEXT NOT NULL,
    tagline TEXT,
    bio TEXT,
    home_city TEXT,
    home_state TEXT,
    program_focus TEXT,
    budget_focus TEXT,
    avatar_url TEXT,
    website_url TEXT,
    showcase_video_url TEXT,
    status TEXT DEFAULT 'pending',
    review_notes TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""

PORTFOLIO_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS portfolio_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    media_url TEXT,
    tags TEXT,
    created_at TEXT NOT NULL
)
"""


def init_database():
    DEFAULT_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DEFAULT_DB))
    try:
        ensure_profile_tables(conn)
    finally:
        conn.close()


def ensure_profile_tables(conn: sqlite3.Connection) -> None:
    conn.execute(PROFILE_TABLE_SQL)
    conn.execute(PORTFOLIO_TABLE_SQL)
    try:
        conn.execute("ALTER TABLE profiles ADD COLUMN owner_id TEXT")
    except sqlite3.OperationalError:
        pass
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_owner ON profiles(owner_id)")
    for column, ddl in (
        ("status", "ALTER TABLE profiles ADD COLUMN status TEXT DEFAULT 'pending'"),
        ("review_notes", "ALTER TABLE profiles ADD COLUMN review_notes TEXT"),
        ("reviewed_at", "ALTER TABLE profiles ADD COLUMN reviewed_at TEXT"),
    ):
        try:
            conn.execute(ddl)
        except sqlite3.OperationalError:
            pass
    conn.commit()


def require_auth(authorization: Optional[str] = Header(default=None)) -> AuthContext:
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(status_code=500, detail="SUPABASE_JWT_SECRET is not configured on the API.")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token.")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing subject claim.")
    return AuthContext(user_id=user_id, email=payload.get("email"))


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> Optional[float]:
    if None in (lat1, lon1, lat2, lon2):
        return None
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_MILES * c

PROGRAM_SUMMARY_COLUMNS = """
    p.rowid AS program_id,
    p.id AS unit_id,
    p.program_code,
    p.program_title,
    p."program_credential.title" AS credential_name,
    p."program_credential.level" AS program_credential_level,
    p."school.name" AS school_name,
    p."school.city" AS city,
    p."school.state" AS state,
    p."school.region_id" AS region_id,
    p.region_name,
    p.avg_net_price,
    COALESCE(p."latest.cost.tuition.in_state", p."latest.cost.tuition.out_of_state") AS resolved_tuition,
    p."latest.cost.tuition.in_state" AS in_state_tuition,
    p."latest.cost.tuition.out_of_state" AS out_state_tuition,
    p.program_opportunity_score,
    p.aid_strength_score,
    p.affordability_score,
    p.supply_gap_score,
    p.scholarship_volatility,
    p.housing_discrepancy_flag,
    p."location.lat" AS latitude,
    p."location.lon" AS longitude
"""

PROGRAM_DETAIL_COLUMNS = PROGRAM_SUMMARY_COLUMNS + """,
    p."latest.student.size" AS student_size,
    p."latest.cost.attendance.academic_year" AS academic_year_cost,
    p."latest.cost.attendance.program_year" AS program_year_cost,
    p."latest.aid.pell_grant_rate" AS pell_grant_rate,
    p."latest.aid.federal_loan_rate" AS federal_loan_rate,
    p."latest.aid.median_debt_completion_suppressed" AS median_debt_completion,
    p."latest.admissions.admission_rate.overall" AS admission_rate,
    p."latest.admissions.sat_scores.average.overall" AS sat_average,
    p."latest.admissions.act_scores.midpoint.cumulative" AS act_midpoint,
    p."latest.earnings.10_yrs_after_entry.median" AS median_earnings_10yr
"""

init_database()

app = FastAPI(
    title="College Decision Engine API",
    version="0.1.0",
    description="Lightweight wrapper around colleges.db to power the front-end decision engine.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

upload_limiter = SimpleRateLimiter(UPLOAD_RATE_LIMIT, UPLOAD_RATE_WINDOW)


class PortfolioItemPayload(BaseModel):
    title: str
    description: Optional[str] = None
    media_url: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class ProfilePayload(BaseModel):
    name: str
    tagline: Optional[str] = None
    bio: Optional[str] = None
    home_city: Optional[str] = None
    home_state: Optional[str] = Field(default=None, min_length=2, max_length=2)
    program_focus: Optional[str] = None
    budget_focus: Optional[str] = None
    avatar_url: Optional[str] = None
    website_url: Optional[str] = None
    showcase_video_url: Optional[str] = None
    portfolio: List[PortfolioItemPayload] = Field(default_factory=list)


class AuthContext(BaseModel):
    user_id: str
    email: Optional[str] = None


class UploadMediaResponse(BaseModel):
    public_url: str
    storage_path: str


class SimpleRateLimiter:
    def __init__(self, max_calls: int, window_seconds: int):
        self.max_calls = max_calls
        self.window = window_seconds
        self.calls: Dict[str, Deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        queue = self.calls[key]
        while queue and now - queue[0] > self.window:
            queue.popleft()
        if len(queue) >= self.max_calls:
            raise HTTPException(
                status_code=429, detail="Upload rate limit exceeded. Please try again later."
            )
        queue.append(now)


def sanitize_filename(filename: Optional[str]) -> str:
    if not filename:
        return "upload"
    name = Path(filename).name
    sanitized = "".join(c if c.isalnum() or c in ("-", "_", ".") else "_" for c in name)
    return sanitized or "upload"


def build_storage_public_url(path: str) -> str:
    if SUPABASE_PUBLIC_BUCKET_URL:
        return f"{SUPABASE_PUBLIC_BUCKET_URL.rstrip('/')}/{path}"
    raise HTTPException(status_code=500, detail="Supabase public bucket URL is not configured.")


def upload_file_to_supabase(owner_id: str, file: UploadFile, kind: str) -> str:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=500, detail="Supabase storage is not configured on the API.")
    filename = sanitize_filename(file.filename)
    extension = Path(filename).suffix
    storage_path = f"{owner_id}/{kind}/{uuid.uuid4().hex}{extension}"
    target_url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/{storage_path}"
    file.file.seek(0)
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "x-upsert": "true",
        "Content-Type": file.content_type or "application/octet-stream",
    }
    response = requests.post(target_url, headers=headers, data=file.file.read(), timeout=60)
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Failed to upload media to Supabase storage.")
    return storage_path


def row_get(row: Any, key: str, default: Any = None) -> Any:
    if isinstance(row, sqlite3.Row):
        if key in row.keys():
            return row[key]
        return default
    return row.get(key, default)


def get_db():
    if not DEFAULT_DB.exists():
        raise HTTPException(status_code=503, detail="Database not found. Run scripts/etl_college_data.py first.")
    conn = sqlite3.connect(str(DEFAULT_DB))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


@app.get("/health")
def healthcheck():
    return {"status": "ok"}


@app.get("/programs")
def list_programs(
    db: sqlite3.Connection = Depends(get_db),
    cip_prefix: Optional[str] = Query(default=None, description="Filter by CIP prefix (e.g., 11.07)"),
    credential: Optional[int] = Query(default=None, ge=1, le=7, description="Credential level (1-7)"),
    region_id: Optional[int] = Query(default=None, ge=1, le=9, description="IPEDS region id"),
    state: Optional[str] = Query(default=None, min_length=2, max_length=2, description="Two-letter state code"),
    max_net_price: Optional[float] = Query(default=None, ge=0),
    near_lat: Optional[float] = Query(default=None, ge=-90, le=90, description="Latitude for proximity filter"),
    near_lon: Optional[float] = Query(default=None, ge=-180, le=180, description="Longitude for proximity filter"),
    near_radius_miles: Optional[float] = Query(
        default=None, ge=1, le=1000, description="Radius in miles for proximity filter"
    ),
    limit: int = Query(default=50, ge=1, le=200),
):
    if (near_lat is None) ^ (near_lon is None):
        raise HTTPException(status_code=400, detail="Provide both near_lat and near_lon for proximity filtering.")
    if near_radius_miles is not None and (near_lat is None or near_lon is None):
        raise HTTPException(
            status_code=400, detail="near_radius_miles requires both near_lat and near_lon to be specified."
        )

    query = f"""
        SELECT
            {PROGRAM_SUMMARY_COLUMNS}
        FROM programs p
        WHERE 1=1
    """
    params: List[Any] = []

    if cip_prefix:
        query += " AND p.program_code LIKE ?"
        params.append(f"{cip_prefix}%")
    if credential:
        query += ' AND p."program_credential.level" = ?'
        params.append(credential)
    if region_id:
        query += " AND p.\"school.region_id\" = ?"
        params.append(region_id)
    if state:
        query += " AND p.\"school.state\" = ?"
        params.append(state.upper())
    if max_net_price is not None:
        query += " AND p.avg_net_price <= ?"
        params.append(max_net_price)
    if near_lat is not None and near_lon is not None:
        radius = near_radius_miles or 100.0
        lat_delta = radius / 69.0
        lon_delta = radius / max(math.cos(math.radians(near_lat)), 0.01) / 69.0
        query += ' AND p."location.lat" BETWEEN ? AND ?'
        params.extend([near_lat - lat_delta, near_lat + lat_delta])
        query += ' AND p."location.lon" BETWEEN ? AND ?'
        params.extend([near_lon - lon_delta, near_lon + lon_delta])

    query += " ORDER BY (p.program_opportunity_score IS NULL), p.program_opportunity_score DESC LIMIT ?"
    params.append(limit)

    cursor = db.execute(query, params)
    rows = [dict(row) for row in cursor.fetchall()]

    if near_lat is not None and near_lon is not None:
        radius = near_radius_miles or 100.0
        filtered: List[Dict[str, Any]] = []
        for row in rows:
            lat = row.get("latitude")
            lon = row.get("longitude")
            distance = haversine_distance(near_lat, near_lon, lat, lon) if lat is not None and lon is not None else None
            if distance is None or distance > radius:
                continue
            row["distance_miles"] = round(distance, 2)
            filtered.append(row)
        rows = sorted(
            filtered,
            key=lambda r: (
                r.get("distance_miles", float("inf")),
                r.get("program_opportunity_score") is None,
                -(r.get("program_opportunity_score") or 0),
            ),
        )

    return {"count": len(rows), "results": rows}


@app.get("/schools")
def list_schools(
    db: sqlite3.Connection = Depends(get_db),
    state: Optional[str] = Query(default=None, min_length=2, max_length=2),
    region_id: Optional[int] = Query(default=None, ge=1, le=9),
    limit: int = Query(default=200, ge=1, le=1000),
):
    query = """
        SELECT
            p.id AS unit_id,
            p."school.name" AS name,
            p."school.city" AS city,
            p."school.state" AS state,
            p."school.region_id" AS region_id,
            p.region_name,
            COUNT(DISTINCT p.program_code) AS program_count,
            AVG(p.avg_net_price) AS avg_net_price,
            AVG(p."latest.cost.tuition.in_state") AS avg_in_state_tuition,
            AVG(p."latest.cost.tuition.out_of_state") AS avg_out_state_tuition,
            AVG(p."latest.student.size") AS avg_student_size
        FROM programs p
        WHERE 1=1
    """
    params: List[Any] = []

    if state:
        query += " AND p.\"school.state\" = ?"
        params.append(state.upper())
    if region_id:
        query += " AND p.\"school.region_id\" = ?"
        params.append(region_id)

    query += """
        GROUP BY name, city, state, region_id, region_name
        ORDER BY name COLLATE NOCASE
        LIMIT ?
    """
    params.append(limit)

    cursor = db.execute(query, params)
    rows = [dict(row) for row in cursor.fetchall()]
    return {"count": len(rows), "results": rows}


@app.get("/locations/states")
def state_profiles(db: sqlite3.Connection = Depends(get_db)):
    cursor = db.execute(
        """
        SELECT
            p."school.state" AS state,
            p."school.region_id" AS region_id,
            p.region_name,
            COUNT(DISTINCT p."school.name") AS school_count,
            COUNT(DISTINCT p.program_code) AS program_count,
            AVG(p."latest.student.size") AS avg_student_size,
            AVG(p."latest.cost.tuition.in_state") AS avg_in_state_tuition,
            AVG(p."latest.cost.tuition.out_of_state") AS avg_out_state_tuition,
            AVG(p."latest.cost.attendance.academic_year") AS avg_cost_of_attendance,
            AVG(p.avg_net_price) AS avg_net_price
        FROM programs p
        WHERE p."school.state" IS NOT NULL
        GROUP BY state, region_id, region_name
        ORDER BY state
        """
    )
    rows = [dict(row) for row in cursor.fetchall()]
    return {"count": len(rows), "results": rows}


@app.get("/locations/cities")
def city_profiles(
    db: sqlite3.Connection = Depends(get_db),
    state: Optional[str] = Query(default=None, min_length=2, max_length=2),
    limit: int = Query(default=500, ge=10, le=5000),
):
    query = """
        SELECT
            p."school.state" AS state,
            p."school.city" AS city,
            p."school.region_id" AS region_id,
            p.region_name,
            COUNT(DISTINCT p."school.name") AS school_count,
            COUNT(DISTINCT p.program_code) AS program_count,
            AVG(p."latest.student.size") AS avg_student_size,
            AVG(p."latest.cost.tuition.in_state") AS avg_in_state_tuition,
            AVG(p."latest.cost.tuition.out_of_state") AS avg_out_state_tuition,
            AVG(p."latest.cost.attendance.academic_year") AS avg_cost_of_attendance,
            AVG(p.avg_net_price) AS avg_net_price
        FROM programs p
        WHERE p."school.state" IS NOT NULL
          AND p."school.city" IS NOT NULL
    """
    params: List[Any] = []
    if state:
        query += " AND p.\"school.state\" = ?"
        params.append(state.upper())

    query += """
        GROUP BY state, city, region_id, region_name
        ORDER BY state, city
        LIMIT ?
    """
    params.append(limit)

    cursor = db.execute(query, params)
    rows = [dict(row) for row in cursor.fetchall()]
    return {"count": len(rows), "results": rows}


@app.get("/locations/cost")
def cost_of_living(
    db: sqlite3.Connection = Depends(get_db),
    city: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    query = """
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
            latitude,
            longitude,
            source,
            last_updated
        FROM location_costs
        WHERE 1=1
    """
    params: List[Any] = []
    if city:
        query += " AND LOWER(city) = LOWER(?)"
        params.append(city)
    if state:
        query += " AND UPPER(state) = UPPER(?)"
        params.append(state)
    query += " ORDER BY last_updated DESC LIMIT ?"
    params.append(limit)

    cursor = db.execute(query, params)
    rows = [dict(row) for row in cursor.fetchall()]
    return {"count": len(rows), "results": rows}


@app.get("/locations/nearby")
def nearby_locations(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_miles: float = Query(100.0, ge=1, le=500),
    limit: int = Query(100, ge=1, le=1000),
    db: sqlite3.Connection = Depends(get_db),
):
    cursor = db.execute(
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
            latitude,
            longitude,
            source,
            last_updated
        FROM location_costs
        WHERE latitude IS NOT NULL
          AND longitude IS NOT NULL
        """
    )
    rows: List[Dict[str, Any]] = []
    for row in cursor.fetchall():
        record = dict(row)
        distance = haversine_distance(lat, lon, record.get("latitude"), record.get("longitude"))
        if distance is None or distance > radius_miles:
            continue
        record["distance_miles"] = round(distance, 2)
        rows.append(record)
    rows.sort(key=lambda item: item.get("distance_miles", float("inf")))
    limited = rows[:limit]
    return {"count": len(limited), "results": limited}


def serialize_portfolio_row(row: sqlite3.Row) -> Dict[str, Any]:
    tags_raw = row["tags"]
    tags: List[str] = []
    if tags_raw:
        try:
            tags = json.loads(tags_raw)
        except json.JSONDecodeError:
            tags = [tag.strip() for tag in tags_raw.split(",") if tag.strip()]
    return {
        "id": row["id"],
        "profile_id": row["profile_id"],
        "title": row["title"],
        "description": row["description"],
        "media_url": row["media_url"],
        "tags": tags,
        "created_at": row["created_at"],
    }


def serialize_profile_row(row: sqlite3.Row, portfolio: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "tagline": row["tagline"],
        "bio": row["bio"],
        "home_city": row["home_city"],
        "home_state": row["home_state"],
        "program_focus": row["program_focus"],
        "budget_focus": row["budget_focus"],
        "avatar_url": row["avatar_url"],
        "website_url": row["website_url"],
        "showcase_video_url": row["showcase_video_url"],
        "status": row_get(row, "status", "pending"),
        "review_notes": row_get(row, "review_notes"),
        "reviewed_at": row_get(row, "reviewed_at"),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "portfolio": portfolio,
    }


def fetch_portfolio_map(db: sqlite3.Connection, profile_ids: List[int]) -> Dict[int, List[Dict[str, Any]]]:
    if not profile_ids:
        return {}
    placeholders = ",".join("?" for _ in profile_ids)
    cursor = db.execute(
        f"""
        SELECT id, profile_id, title, description, media_url, tags, created_at
        FROM portfolio_items
        WHERE profile_id IN ({placeholders})
        ORDER BY datetime(created_at) DESC
        """,
        profile_ids,
    )
    mapping: Dict[int, List[Dict[str, Any]]] = {pid: [] for pid in profile_ids}
    for row in cursor.fetchall():
        mapping.setdefault(row["profile_id"], []).append(serialize_portfolio_row(row))
    return mapping


def fetch_profile(db: sqlite3.Connection, profile_id: int) -> Optional[Dict[str, Any]]:
    row = db.execute(
        """
        SELECT *
        FROM profiles
        WHERE id = ?
        """,
        (profile_id,),
    ).fetchone()
    if not row:
        return None
    portfolio_map = fetch_portfolio_map(db, [profile_id])
    return serialize_profile_row(row, portfolio_map.get(profile_id, []))


def insert_portfolio_items(
    db: sqlite3.Connection, profile_id: int, items: List[PortfolioItemPayload]
) -> List[Dict[str, Any]]:
    created_rows: List[Dict[str, Any]] = []
    if not items:
        return created_rows
    now = datetime.utcnow().isoformat()
    for item in items:
        tags_json = json.dumps(item.tags)
        cursor = db.execute(
            """
            INSERT INTO portfolio_items (profile_id, title, description, media_url, tags, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                profile_id,
                item.title.strip(),
                item.description,
                item.media_url,
                tags_json,
                now,
            ),
        )
        created_rows.append(
            {
                "id": cursor.lastrowid,
                "profile_id": profile_id,
                "title": item.title.strip(),
                "description": item.description,
                "media_url": item.media_url,
                "tags": item.tags,
                "created_at": now,
            }
        )
    db.commit()
    return created_rows


def ensure_profile_owner(db: sqlite3.Connection, profile_id: int, owner_id: str) -> None:
    row = db.execute("SELECT owner_id FROM profiles WHERE id = ?", (profile_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not row["owner_id"] or row["owner_id"] != owner_id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this profile")


@app.get("/profiles")
def list_profiles(
    db: sqlite3.Connection = Depends(get_db),
    state: Optional[str] = Query(default=None, min_length=2, max_length=2),
    program_focus: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
):
    query = """
        SELECT *
        FROM profiles
        WHERE 1=1
    """
    params: List[Any] = []
    if state:
        query += " AND home_state = ?"
        params.append(state.upper())
    if program_focus:
        query += " AND program_focus LIKE ?"
        params.append(f"%{program_focus}%")
    if search:
        query += " AND (name LIKE ? OR bio LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])

    query += " ORDER BY datetime(updated_at) DESC LIMIT ?"
    params.append(limit)

    cursor = db.execute(query, params)
    rows = cursor.fetchall()
    profile_ids = [row["id"] for row in rows]
    portfolio_map = fetch_portfolio_map(db, profile_ids)
    results = [serialize_profile_row(row, portfolio_map.get(row["id"], [])) for row in rows]
    return {"count": len(results), "results": results}


@app.get("/profiles/{profile_id}")
def profile_detail(profile_id: int, db: sqlite3.Connection = Depends(get_db)):
    profile = fetch_profile(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@app.get("/profiles/me")
def my_profile(auth: AuthContext = Depends(require_auth), db: sqlite3.Connection = Depends(get_db)):
    row = db.execute(
        """
        SELECT *
        FROM profiles
        WHERE owner_id = ?
    """,
        (auth.user_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")
    portfolio_map = fetch_portfolio_map(db, [row["id"]])
    return serialize_profile_row(row, portfolio_map.get(row["id"], []))


@app.post("/profiles", status_code=201)
def create_profile(
    payload: ProfilePayload,
    auth: AuthContext = Depends(require_auth),
    db: sqlite3.Connection = Depends(get_db),
):
    now = datetime.utcnow().isoformat()
    existing = db.execute("SELECT id FROM profiles WHERE owner_id = ?", (auth.user_id,)).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="Profile already exists for this account.")
    cursor = db.execute(
        """
        INSERT INTO profiles (
            owner_id, name, tagline, bio, home_city, home_state, program_focus, budget_focus,
            avatar_url, website_url, showcase_video_url, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            auth.user_id,
            payload.name.strip(),
            payload.tagline,
            payload.bio,
            payload.home_city,
            payload.home_state.upper() if payload.home_state else None,
            payload.program_focus,
            payload.budget_focus,
            payload.avatar_url,
            payload.website_url,
            payload.showcase_video_url,
            "pending",
            now,
            now,
        ),
    )
    profile_id = cursor.lastrowid
    insert_portfolio_items(db, profile_id, payload.portfolio)
    db.commit()
    profile = fetch_profile(db, profile_id)
    return profile


@app.post("/profiles/{profile_id}/portfolio", status_code=201)
def add_portfolio_item(
    profile_id: int,
    payload: PortfolioItemPayload,
    auth: AuthContext = Depends(require_auth),
    db: sqlite3.Connection = Depends(get_db),
):
    ensure_profile_owner(db, profile_id, auth.user_id)
    items = insert_portfolio_items(db, profile_id, [payload])
    return items[0] if items else {}


@app.put("/profiles/{profile_id}")
def update_profile(
    profile_id: int,
    payload: ProfilePayload,
    auth: AuthContext = Depends(require_auth),
    db: sqlite3.Connection = Depends(get_db),
):
    ensure_profile_owner(db, profile_id, auth.user_id)
    now = datetime.utcnow().isoformat()
    db.execute(
        """
        UPDATE profiles
        SET name = ?, tagline = ?, bio = ?, home_city = ?, home_state = ?, program_focus = ?,
            budget_focus = ?, avatar_url = ?, website_url = ?, showcase_video_url = ?, status = 'pending',
            review_notes = NULL, reviewed_at = NULL, updated_at = ?
        WHERE id = ?
        """,
        (
            payload.name.strip(),
            payload.tagline,
            payload.bio,
            payload.home_city,
            payload.home_state.upper() if payload.home_state else None,
            payload.program_focus,
            payload.budget_focus,
            payload.avatar_url,
            payload.website_url,
            payload.showcase_video_url,
            now,
            profile_id,
        ),
    )
    db.execute("DELETE FROM portfolio_items WHERE profile_id = ?", (profile_id,))
    insert_portfolio_items(db, profile_id, payload.portfolio)
    db.commit()
    return fetch_profile(db, profile_id)


@app.delete("/profiles/{profile_id}", status_code=204)
def delete_profile(
    profile_id: int,
    auth: AuthContext = Depends(require_auth),
    db: sqlite3.Connection = Depends(get_db),
):
    ensure_profile_owner(db, profile_id, auth.user_id)
    db.execute("DELETE FROM portfolio_items WHERE profile_id = ?", (profile_id,))
    db.execute("DELETE FROM profiles WHERE id = ?", (profile_id,))
    db.commit()
    return Response(status_code=204)


@app.post("/profiles/upload-media", response_model=UploadMediaResponse)
async def upload_profile_media(
    kind: str = Form(...),
    file: UploadFile = File(...),
    auth: AuthContext = Depends(require_auth),
):
    allowed_kinds = {"avatar", "portfolio", "video"}
    if kind not in allowed_kinds:
        raise HTTPException(status_code=400, detail="Invalid media kind.")
    upload_limiter.check(auth.user_id)
    storage_path = upload_file_to_supabase(auth.user_id, file, kind)
    public_url = build_storage_public_url(storage_path)
    return UploadMediaResponse(public_url=public_url, storage_path=storage_path)


@app.get("/programs/{program_id}")
def program_detail(program_id: int, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.execute(
        f"""
        SELECT
            {PROGRAM_DETAIL_COLUMNS}
        FROM programs p
        WHERE p.rowid = ?
        """,
        (program_id,),
    )
    row = cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Program not found")
    return dict(row)


@app.get("/schools/{unit_id}")
def school_detail(
    unit_id: int,
    db: sqlite3.Connection = Depends(get_db),
    program_limit: int = Query(default=25, ge=1, le=200),
):
    profile = db.execute(
        """
        SELECT
            p.id AS unit_id,
            p."school.name" AS name,
            p."school.city" AS city,
            p."school.state" AS state,
            p."school.region_id" AS region_id,
            p.region_name,
            p."school.school_url" AS website,
            AVG(p."latest.student.size") AS avg_student_size,
            COUNT(DISTINCT p.program_code) AS program_count,
            AVG(p.avg_net_price) AS avg_net_price,
            AVG(p."latest.cost.tuition.in_state") AS avg_in_state_tuition,
            AVG(p."latest.cost.tuition.out_of_state") AS avg_out_state_tuition,
            AVG(p."latest.cost.attendance.academic_year") AS avg_cost_of_attendance,
            AVG(p."latest.aid.pell_grant_rate") AS pell_grant_rate,
            AVG(p."latest.aid.federal_loan_rate") AS federal_loan_rate
        FROM programs p
        WHERE p.id = ?
        GROUP BY unit_id, name, city, state, region_id, region_name, website
        """,
        (unit_id,),
    ).fetchone()

    if profile is None:
        raise HTTPException(status_code=404, detail="School not found")

    programs = db.execute(
        f"""
        SELECT
            {PROGRAM_SUMMARY_COLUMNS}
        FROM programs p
        WHERE p.id = ?
        ORDER BY (p.program_opportunity_score IS NULL), p.program_opportunity_score DESC
        LIMIT ?
        """,
        (unit_id, program_limit),
    ).fetchall()

    return {"school": dict(profile), "programs": [dict(row) for row in programs]}



