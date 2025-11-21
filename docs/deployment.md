# Deployment & Automation Guide

This guide covers the recurring data refresh workflow, runtime health checks, and container packaging for the College Decision Engine.

## 1. Scheduled Data Refresh

### GitHub Actions workflow
- File: `.github/workflows/data-refresh.yml`
- Schedule: every Monday at 06:00 UTC (also manually runnable via *workflow_dispatch*).
- Steps:
  1. Installs Python 3.11 and the shared requirements.
  2. Runs the ETL, cost-of-living enrichment, fallback augmentation, and static export scripts:
     ```
     python scripts/etl_college_data.py
     python scripts/cost_of_living.py
     python scripts/update_teleport_fallback.py
     python scripts/augment_state_costs.py
     python scripts/generate_location_profiles.py --csv
     python scripts/generate_schools_html.py
     ```
  3. Uploads refreshed artifacts (`data/colleges.db`, location summaries, fallback JSON, `schools.html`) as a downloadable build artifact.

### Required secrets
- `COLLEGE_SCORECARD_API_KEY` – API key from api.data.gov; the job fails early if it is missing.
- `SUPABASE_JWT_SECRET` – used by the API to verify Supabase-issued access tokens. The weekly workflow only touches data, but production FastAPI instances must have this secret configured.

### Consuming the refreshed cache
1. Download the `colleges-cache` artifact from the workflow run summary.
2. Extract the files into `data/` locally or in the deployment environment.
3. Restart the API container (or redeploy) so it reads the updated SQLite cache.

## 2. Production Health Alerts

- File: `.github/workflows/healthcheck.yml`
- Schedule: twice per day (every 12 hours) with manual trigger support.
- Configure optional secrets:
  - `API_HEALTHCHECK_URL`
  - `CLIENT_HEALTHCHECK_URL`
- Each configured URL is pinged with `curl --fail --retry 3 --retry-delay 5`. Failures surface directly in the Actions UI and can be wired into repository notifications.

## 3. Container Packaging

### Backend (FastAPI)
- Dockerfile: `Dockerfile.api`
- Builds a Python 3.11 slim image, installs `requirements.txt`, copies `api/`, `scripts/`, `data/`, and runs `uvicorn api.main:app --host 0.0.0.0 --port 8000`.
- Runtime expectation: `data/colleges.db` already exists. Mount `./data:/app/data` for persistence (see `docker-compose.yml`).

### Frontend (Vite React)
- Dockerfile: `client/Dockerfile`
  - Stage 1: Node 20 build (`npm ci && npm run build`).
  - Stage 2: Nginx 1.27 serving `/usr/share/nginx/html`.
  - Build argument `VITE_API_BASE_URL` defaults to `https://localhost:8000`; override it in production to point at the deployed API.
- Static hosting includes a `/health` endpoint that returns `{"status":"ok"}` for uptime monitors.
- Manual chunking keeps the SPA bundle under the warning threshold (see `client/vite.config.ts`), so static hosts/CDNs receive smaller vendor chunks (`react.*.js`, `charts.*.js`, etc.).
- Shipping without Docker: run `npm run build` inside `client/`, then upload the contents of `client/dist/` to any static host (S3/CloudFront, Render Static, Netlify). Remember to set the same `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` environment variables at build time before generating the bundle.

### Local orchestration
- File: `docker-compose.yml`
  - `api` service: exposes `8000`, mounts `./data`.
  - `web` service: builds `client/Dockerfile`, exposes `4173`, depends on `api`.
- Usage:
  ```bash
  docker compose build
  docker compose up
  ```
- Override the API base URL on build:
  ```bash
  docker compose build \
    --build-arg VITE_API_BASE_URL=https://api.example.com
  ```

## 4. Authentication & Storage Config

- **Supabase project**: create a Supabase project (can be the free tier) for Auth + Storage. Capture:
  - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (frontend env vars, injected at build time).
  - `SUPABASE_JWT_SECRET` (backend env var, available under Project Settings → API).
- **Email magic links**: enable Email OTP flow in Supabase Auth so students can request a secure sign-in link from the showcase page.
- **Storage buckets** (optional today): create a `profiles` bucket for avatars and portfolio media. Once we expose uploads, store the public bucket URL in `VITE_SUPABASE_STORAGE_URL`.
- **Local development**: store Supabase keys in `.env` and `.env.local`:
  ```
  SUPABASE_JWT_SECRET=...
  VITE_SUPABASE_URL=https://xyz.supabase.co
  VITE_SUPABASE_ANON_KEY=public-anon-key
  ```

## 5. Deployment Checklist

1. **Secrets & Repository Variables**
   - `COLLEGE_SCORECARD_API_KEY`
   - `SUPABASE_JWT_SECRET`
   - `VITE_SUPABASE_ANON_KEY`
   - Optional health-check URLs
   - Repository variables (non-secret) for SPA builds:
     - `VITE_API_BASE_URL`
     - `VITE_SUPABASE_URL`
2. **Data Refresh**
   - Confirm weekly workflow succeeds (download artifact on failure and redeploy manually if needed).
3. **Containers**
   - Build/push images (e.g., to GHCR, Docker Hub, or Render/Fly registries).
   - Provide `data/` volume or re-run ETL within the container prior to launch.
4. **Env Variables**
   - Frontend build-time: `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
   - API runtime: access to `data/colleges.db` plus `SUPABASE_JWT_SECRET`.
5. **Monitoring**
   - Wire GitHub Actions failure notifications or custom alerting around the healthcheck workflow.

## 6. Frontend Static Deployments (GitHub Pages)

Publishing the SPA via GitHub Pages keeps hosting free while you scale.

### Repository setup
1. In **Settings → Pages**, set the build source to **GitHub Actions**.
2. Add repository secrets/variables:
   - Secrets: `VITE_SUPABASE_ANON_KEY`
   - Variables: `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`
3. (Optional) create `client/.env.production` for local builds using the same values.

### Workflow overview
- File: `.github/workflows/deploy-frontend.yml`
- Triggers: pushes to `main` that touch `client/**` (plus manual dispatch).
- Jobs:
  1. **build**: installs Node 20 deps inside `client/`, runs `npm run build`, and uploads `client/dist` as a Pages artifact (with Vite env vars sourced from repository variables/secrets).
  2. **deploy**: reuses GitHub’s `actions/deploy-pages` to publish the artifact to the `gh-pages` branch / Pages CDN.
- Permissions: the workflow requests `pages: write` + `id-token: write` as required by the official Pages action.

### Local preview + manual publish
1. From `/client`, run `npm install` (once) and `npm run build`.
2. Inspect the output via `npm run preview` (serves the production build on `4173` by default).
3. When satisfied, push to `main`—the GitHub Action handles the Pages publish automatically. No AWS buckets, SSL certs, or CDNs to maintain until funding arrives.
