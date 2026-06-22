# Blueslate — Claude Code project memory

Blueslate is a multi-tenant, AI-native GTM platform for kids-enrichment franchises.
Module 1 is a voice agent (inbound/outbound calls + lead capture); Module 2 is an AI
content studio. Everything is grounded in a per-tenant knowledge base. Pilot tenant:
XP League Frisco (Esports). Hard constraints: $0 cost (free tiers only) and multi-tenant
isolation from day one.

## Project state
- Phase 0 complete: full v2 schema, RLS, seed data, design tokens.
- Phase 1 in progress: async KB ingestion backbone DONE (local + production via Inngest).
- Next Phase 1 task: multi-source ingestion (file upload + voice note) + source-priority merge.

## Stack & layout
- Backend: FastAPI on Render. Code in `backend/app/`. Run: `uvicorn app.main:app` from `backend/`.
- Frontend: Next.js (App Router) on Vercel. Code in `frontend/src/app/`.
- DB: Supabase Postgres. AI: Groq (`llama-3.3-70b-versatile`). Scrape: Firecrawl. Async jobs: Inngest.
- Backend talks to DB/Groq/Firecrawl; frontend never holds DB keys. Frontend → backend via
  `NEXT_PUBLIC_API_URL` (must be in `frontend/.env.local`). CORS allow-list lives in `main.py`.

## Database / migrations
- Migrations: `supabase/migrations/NN_name.sql`, numbered 01–08, run in order via the Supabase SQL Editor.
- EVERY new table must end with: `grant select, insert, update, delete on public.<table> to service_role;`
  — without it the backend hits "permission denied" (service_role isn't auto-granted on new tables).
- Enable RLS on every tenant table with the policy: `tenant_id = (current_setting('app.tenant_id', true))::uuid`.
- RLS reality: backend uses the service_role key, which BYPASSES RLS. So tenant isolation is currently
  enforced at the app layer — ALWAYS filter queries with `.eq('tenant_id', ...)`. RLS is a dormant
  safety net for future hardening.
- `tenants` is intentionally RLS-OFF (bootstrap lookup). `credit_ledger` is append-only (a trigger blocks
  UPDATE/DELETE; balance = sum of entries).

## Schema map
- `tenants` = the franchisee record (v1 table, extended with activity_id, brand_id, voice_id, agent_name,
  timezone, post-call toggles, onboarding_completed).
- Taxonomy (global, admin data, never enums): `activities`, `activity_config`, `brands`.
- Prospect funnel: `contacts`, `children`, `activity_log`, `lead_statuses`.
- `credit_ledger` (append-only), `kb_jobs` (async ingestion progress), plus v1 `knowledge_base`,
  `leads`, `call_logs`.

## Async jobs (Inngest)
- Endpoint served at `/api/inngest` from FastAPI via `inngest.fast_api.serve(...)` in `main.py`.
- Functions in `backend/app/inngest_functions.py` (client app_id `blueslate`; functions: `test-function`,
  `run-kb-ingestion`). Ingestion helpers in `backend/app/kb_ingestion.py`.
- Dev vs prod is decided ONLY by the `INNGEST_DEV` env var:
  - Local: `INNGEST_DEV=1` in `backend/.env`. Run the dev server:
    `npx inngest-cli@latest dev -u http://localhost:8000/api/inngest` (UI at localhost:8288).
  - Production (Render): set `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`; NEVER set `INNGEST_DEV` there.
- Sync to Inngest Cloud MANUALLY by URL using the Render endpoint (`https://<render>/api/inngest`).
  Do NOT use the Vercel integration — the endpoint is on the Render backend, not Vercel.
- Pattern: wrap each phase of long work in `await ctx.step.run(...)` for durable, memoized, per-step retries.

## KB ingestion flow
- `POST /scrape` is enqueue-only: looks up tenant, inserts a `kb_jobs` row, sends `kb/ingest.requested`,
  returns `{job_id}` instantly.
- `run-kb-ingestion` runs scrape → extract → save as steps, updating `kb_jobs.status`
  (queued → scraping → extracting → merging → completed/failed).
- `GET /kb-jobs/{job_id}` is the polling endpoint for the UI.
- Known gap: the scrape's fixed URL list doesn't capture pricing — expected; will be filled by the owner
  via upload/voice note in the source-priority merge (voice > upload > scrape > brand KB > activity config).

## Frontend conventions
- Styling is INLINE React style objects (no CSS Modules, no Tailwind).
- Design tokens: CSS vars in `frontend/src/app/globals.css` (`:root`) + a `tokens.ts` object that
  references them (e.g. `tokens.brandTeal`).
- v2 design system is a LIGHT app (slate nav, light content, white cards) — not the v1 all-dark theme.

## Working conventions
- Single root-level Python venv (`venv`), not per-service.
- Prefer step-by-step changes with a verification checkpoint before moving on.
- Phases are dependency-ordered; infrastructure hardening precedes feature work.