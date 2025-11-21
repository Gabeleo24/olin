# Location Cost Profiles

Use `scripts/generate_location_profiles.py` to create state- and city-level summaries of tuition and net price so you can compare cost levels across all 50 states (plus territories) and major cities.

## Command

```bash
source .env
python scripts/generate_location_profiles.py \
  --db data/colleges.db \
  --output-dir data \
  --city-limit 2000 \
  --csv
```

Options:
- `--city-limit`: cap the number of city rows (defaults to 2000); raise this to capture every city in the cache.
- `--csv`: emits CSV files alongside JSON for spreadsheet workflows.

## Outputs

- `data/location_states.json` / `.csv`: one row per state with region, school count, program count, and averaged costs (net price, tuition, cost of attendance, student size).
- `data/location_cities.json` / `.csv`: city + state rows with the same metrics, useful for drilling into metro-level affordability.

Each JSON payload includes metadata (`dimension`, `generated_at`, `record_count`) for traceability.


