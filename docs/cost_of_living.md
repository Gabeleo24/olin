# Cost of Living Pipeline

The `scripts/cost_of_living.py` task enriches `data/colleges.db` with city-level cost metrics so students can budget beyond tuition.

## Data Source
- **Primary**: Teleport Urban Areas API (cost-of-living category, USD values)
- **Fallback**: `data/teleport_fallback.json` (bundled estimates for major U.S. metros when Teleport is unreachable)

Collected metrics per city/state:
- `cost_index`, `cost_plus_rent_index`, `rent_index`, `groceries_index`, `restaurant_index`
- Sample monthly costs: `rent_small` (1BR city center), `rent_large` (3BR), `meal_cost`, `transit_monthly`

## Running the Ingestion

```bash
python scripts/cost_of_living.py
```

This script:
1. Queries `programs` for distinct city/state pairs.
2. Resolves each city to a Teleport slug (with manual overrides for common metros).
3. Fetches cost metrics (or falls back to `teleport_fallback.json` if offline).
4. Upserts the results into the SQLite table `location_costs`.

## API Exposure
The FastAPI service now exposes `GET /locations/cost`, allowing filters by `city`, `state`, and result limits. Each record includes the stored indexes, estimated rents, meal, and transit costs with timestamps and source metadata.

## Notes / Future Work
- Extend the fallback dataset with additional metros or integrate other open sources (HUD FMR, MIT Living Wage) to cover smaller college towns.
- Schedule the ingestion alongside the main ETL so rent data stays current.
- Combine cost-of-living figures with tuition/net-price data in the front end to present a full annual budget planner.


