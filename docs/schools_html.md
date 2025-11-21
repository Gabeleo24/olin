# Schools HTML Snapshot

`scripts/generate_schools_html.py` converts the cached `programs` table into a static `data/schools.html` page that lists each institution, location, region, program count, and average pricing signals.

## Running the Export

```bash
source .env
python scripts/generate_schools_html.py \
  --db data/colleges.db \
  --output data/schools.html \
  --title "College Program Providers"
```

Flags:
- `--limit N` restricts the number of schools for preview/testing.
- `--output` controls the destination path; defaults to `data/schools.html`.

## Output Structure

The generated HTML includes:
- Page title + timestamp
- Summary count of institutions rendered
- Table columns: School, Location, Region, Programs, Avg Net Price, In-State Tuition, Out-of-State Tuition

The template relies on the aggregated view produced via SQLite (`COUNT(DISTINCT program_code)` and average cost metrics). Styling is inline for portability, so the file can be dropped into any static host or emailed as-is.


