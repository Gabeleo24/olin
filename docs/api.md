# Internal API Service

FastAPI wrapper over `data/colleges.db` so the front end (or external clients) can query programs, schools, and location profiles without touching SQLite directly.

## Installation

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Running Locally

```bash
source .env  # ensures the ETL can refresh the DB when needed
python scripts/etl_college_data.py  # optional refresh
uvicorn api.main:app --reload
```

By default UVicorn listens on `http://127.0.0.1:8000`. Swagger UI is available at `/docs`.

## Front-end Integration

1. Copy `client/.env.example` → `client/.env.local` (or `.env`) and set `VITE_API_BASE_URL` to the FastAPI host, e.g. `http://localhost:8000`.
2. Install client deps and start Vite:
   ```bash
   cd client
   npm install
   npm run dev
   ```
3. The dashboard now calls the live endpoints (`/programs`, `/locations/states`, `/locations/cities`). Keep the FastAPI server running alongside `npm run dev`.

## Key Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Basic health check |
| GET | `/programs` | Program-centric rows with filters (`cip_prefix`, `credential`, `state`, `region_id`, `max_net_price`, `limit`) plus optional proximity search (`near_lat`, `near_lon`, `near_radius_miles`) sorted by opportunity score |
| GET | `/programs/{program_id}` | Detailed view of a single program (tuition, aid, admissions, earnings) |
| GET | `/schools` | Aggregated school list with program counts and averaged costs; filterable by state/region |
| GET | `/schools/{unit_id}` | Detailed school profile with averaged metrics and top programs |
| GET | `/locations/states` | State-level cost summaries (count of schools/programs, avg tuition/net price) |
| GET | `/locations/cities` | City-level summaries with optional state filter |
| GET | `/locations/cost` | Cost-of-living metrics (rent, meal, transit, indexes) filterable by city/state |
| GET | `/locations/nearby` | Radius search for cost-of-living records near a latitude/longitude (`lat`, `lon`, `radius_miles`, `limit`) returning distance-sorted results |
| GET | `/profiles` | List student profiles & portfolios; filters: `state`, `program_focus`, `search`, `limit` |
| GET | `/profiles/{profile_id}` | Detailed profile with nested portfolio entries |
| GET | `/profiles/me` | Return the authenticated student’s profile (requires `Authorization: Bearer <supabase-jwt>`) |
| POST | `/profiles` | Create a new profile + optional portfolio items (`name`, `bio`, `home_state`, `portfolio[]`) — requires Supabase auth |
| PUT | `/profiles/{profile_id}` | Update an owned profile + portfolio set — requires Supabase auth |
| DELETE | `/profiles/{profile_id}` | Delete an owned profile — requires Supabase auth |
| POST | `/profiles/{profile_id}/portfolio` | Append a portfolio item to an existing profile — requires Supabase auth |

The API hits the SQLite cache directly on each request; make sure `data/colleges.db` exists (run `scripts/etl_college_data.py` first).

> **Auth note**: Supabase issues the JWT used by the FastAPI auth dependency. Set `SUPABASE_JWT_SECRET` on the API process and send the access token returned by `supabase.auth.getSession()` as the `Authorization` header for create/update/delete operations.

### Profile Payload

```json
{
  "name": "Avery Chen",
  "home_state": "WA",
  "program_focus": "11.0802 Data Science",
  "bio": "Pacific Northwest transfer student designing tools for first-gen peers.",
  "portfolio": [
    {
      "title": "Dorm Food Budget Planner",
      "description": "Blended USDA + Pell data to help roommates plan meals.",
      "media_url": "https://budget-planner.example.com",
      "tags": ["budget", "data"]
    }
  ]
}
```


