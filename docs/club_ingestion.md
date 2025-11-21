# Club Ingestion Pipeline

## Overview
The program-centric College Scorecard cache now supports an adjacent `clubs` table that stores student organization metadata per institution. Data flows in through a configurable pipeline that can pull from:

- JSON-based vendor APIs (Presence/CampusLabs Engage, CampusGroups, etc.)
- Manual CSV exports that student life offices send periodically
- Static payloads for quick pilots or hand-curated datasets

Each connector normalizes raw fields into a common schema (`ClubRecord`) before writing them into `data/colleges.db`.

## Configuration

1. Copy `config/club_sources.example.json` to `config/club_sources.json` (ignored by git).
2. For each institution you want to ingest, add an object with:
   - `school_name`, `unit_id`, `city`, `state`
   - `source` block specifying the connector type and access details.

### JSON API Connector
```json
{
  "school_name": "Demo University",
  "unit_id": 123456,
  "city": "Sampletown",
  "state": "CA",
  "source": {
    "type": "json_api",
    "name": "Presence Demo",
    "url": "https://demo.campuslabs.com/engage/api/organizations",
    "headers": {"X-Api-Key": "TOKEN"},
    "params": {"take": 200},
    "pagination": {
      "mode": "offset",
      "size_param": "take",
      "offset_param": "skip",
      "page_size": 200
    },
    "data_path": "value",
    "field_map": {
      "club_name": "name",
      "summary": "description",
      "category": "categories.0.name",
      "contact_email": "primaryEmail",
      "contact_url": "profileUrl",
      "tags": "tags"
    }
  }
}
```

- `data_path` points to the list within the JSON response (use dot notation).
- `field_map` maps normalized fields to source paths (dot notation, supports list indexes).
- Pagination modes supported: `offset` (`skip`/`take` pattern) and `page` (`page`/`per_page`).

### CSV Connector
```json
{
  "school_name": "CSV College",
  "unit_id": 654321,
  "city": "Export",
  "state": "TX",
  "source": {
    "type": "csv_file",
    "name": "Manual Upload",
    "path": "data/csv_college_clubs.csv",
    "field_map": {
      "club_name": "Organization",
      "category": "Category",
      "membership_size": "Members",
      "contact_email": "Email",
      "summary": "Description"
    }
  }
}
```

### Static Connector
Use `type: "static"` with a `records` array for small pilots or tests.

## Running the Pipeline

```bash
source .env  # ensures DB key + API tokens in environment
python scripts/ingest_club_data.py \
  --config config/club_sources.json \
  --db data/colleges.db \
  --mode replace \
  --verbose
```

Flags:
- `--mode append` keeps existing records and adds new ones.
- `--dry-run` fetches and logs results without touching the database.

## Schema

The `clubs` table stores:

| Column | Description |
| --- | --- |
| `school_name` | Institution label (matches programs table) |
| `unit_id` | IPEDS Unit ID for joins |
| `school_city` / `school_state` | Location metadata |
| `club_name` | Display name of the organization |
| `summary` | Short description/mission |
| `category` / `subcategory` | High-level grouping |
| `tags` | Comma-separated tags from the source |
| `membership_size` | Reported member count (if available) |
| `meeting_cadence` | Notes about meeting frequency/modalities |
| `is_virtual` | Boolean flag for online-first orgs |
| `contact_email` / `contact_url` | Outreach hooks |
| `source_name` / `source_type` | Traceability for the connector |
| `ingested_at` | UTC timestamp |

Indices on `school_name` and `unit_id` allow fast joins back to the `programs` table or downstream APIs.

## Next Steps

- Add connector subclasses for specific vendors if they expose bespoke authentication (e.g., OAuth flows).
- Schedule the club ingestion alongside the Scorecard ETL to keep time-aligned snapshots.
- Extend the `field_map` to capture leadership roles or event counts when sources provide them.


