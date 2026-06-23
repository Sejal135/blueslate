# Blueslate — Claude Code project memory

Blueslate is a multi-tenant, AI-native GTM platform for kids-enrichment franchises.
Module 1 is a voice agent (inbound calls + lead capture); Module 2 is an AI
content studio + outbound calls. Everything is grounded in a per-tenant knowledge base. Pilot tenant:
XP League Frisco (Esports). Hard constraints: $0 cost (free tiers only) and multi-tenant
isolation from day one.

## Project state
- Phase 0 complete: full v2 schema, RLS, seed data, design tokens.
- Phase 1 in progress: async KB ingestion backbone DONE (local + production via Inngest), multi-source ingestion (file upload + voice note) + source-priority merge DONE.


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
- Three ingest endpoints, all enqueue-only (look up tenant, store source if needed, insert a `kb_jobs`
  row, send `kb/ingest.requested`, return `{job_id}` instantly):
  - `POST /scrape` — source_type `scrape` (Firecrawl).
  - `POST /ingest/file` — source_type `upload`; stores file in the `kb-uploads` Supabase Storage bucket,
    parses PDF/DOCX/TXT.
  - `POST /ingest/voice` — source_type `voice`; stores audio in `kb-uploads`, transcribes via Groq Whisper.
- `run-kb-ingestion` branches on `source_type` to get the text (scrape / parse-file / transcribe), then
  runs shared steps: extract (Groq) → upsert-source → rebuild-kb. Updates `kb_jobs.status`
  (queued → scraping → extracting → merging → completed/failed).
- `GET /kb-jobs/{job_id}` is the polling endpoint for the UI.
- Source-priority merge: each ingestion writes a layer to `kb_sources` (voice 5 > upload 4 > scrape 3 >
  brand 2). `rebuild_kb(tenant_id)` overlays them low→high (higher-trust non-empty field wins) into the
  single active `knowledge_base` row that the agent reads. List fields overwrite rather than union.
- Known gaps (deferred, not bugs): the scrape's fixed URL list misses pages like pricing (owners fill via
  upload/voice); `extract_kb`'s Groq prompt is still hardcoded to "esports website" (make activity-aware
  later); `activity_config` is intentionally NOT in the field-merge (different shape, used at prompt time).
- Helpers in `backend/app/kb_ingestion.py`: `scrape_site`, `parse_file`, `transcribe_voice`, `extract_kb`,
  `upsert_source`, `rebuild_kb`, `set_job_status`. (`save_kb` was removed — superseded by upsert + rebuild.)
  
## Frontend conventions
- Onboarding flow lives at frontend/src/app/onboarding/page.tsx, is a single client component holding all step state.
- Styling is INLINE React style objects (no CSS Modules, no Tailwind).
- Design tokens: CSS vars in `frontend/src/app/globals.css` (`:root`) + a `tokens.ts` object that
  references them (e.g. `tokens.brandTeal`).
- v2 design system is a LIGHT app (slate nav, light content, white cards) — not the v1 all-dark theme.

## Working conventions
- Single root-level Python venv (`venv`), not per-service.
- Prefer step-by-step changes with a verification checkpoint before moving on.
- Phases are dependency-ordered; infrastructure hardening precedes feature work.

## Tenant isolation
- Endpoints resolve tenant by `slug` passed from the frontend: `/leads?tenant_slug=…`, `/scrape`,
  `/ingest/file`, `/ingest/voice`, `/brands?activity_id=…`. The frontend gets its slug from the
  onboarding flow (`POST /onboarding/tenant`).
- KNOWN GAP — `/webhook` (Retell post-call) still resolves the tenant by a hardcoded `xpleague-frisco`.
  Correct fix is phone-number → tenant lookup, blocked on per-franchise Twilio number provisioning
  (the unresolved SIP inbound item). Safe placeholder until telephony-per-tenant exists.
- TODO (non-urgent): the "look up tenant_id from slug" block repeats across endpoints — extract a
  `get_tenant_id(slug)` helper when convenient.