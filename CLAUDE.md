# Blueslate — Claude Code project memory

Blueslate is a multi-tenant, AI-native GTM platform for kids-enrichment franchises.
Module 1 is a voice agent (inbound calls + lead capture); Module 2 is an AI
content studio + outbound calls. Everything is grounded in a per-tenant knowledge base. Pilot tenant:
XP League Frisco (Esports). Hard constraints: $0 cost (free tiers only) and multi-tenant
isolation from day one.


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
- KNOWN GAP — `/webhook` it resolves tenant from call.metadata.tenant_slug (outbound). falls back to pilot for inbound for tenant_slug in main.py, for inbound it is hardcoded `xpleague-frisco`.
  Correct fix is phone-number → tenant lookup, blocked on per-franchise Twilio number provisioning
  (the unresolved SIP inbound item). Safe placeholder until telephony-per-tenant exists.
  - Corrupt/scanned PDFs fail the parse step with a raw error; acceptable for now but the UI does not show failed or a friendlier parse-level guard would help.
  - Need to improve the agent message as it currently it indicated the wrong date.
  - For contacts/tenants dashboard: Want a way to clean up / soft-delete test tenants. Not now, but note it.
  - TODO (non-urgent): the "look up tenant_id from slug" block repeats across endpoints — extract a
  `get_tenant_id(slug)` helper when convenient.

URGENT TO-DO:
- Item 17 (TDoS throttle) — DEFERRED, not optional. Real enforcement (A) must hook Retell's call_started (pre-call) to drop 3+ calls from one number in 10 min before answering. Not built because inbound is currently one shared number (XP League only) — no real attack surface yet. Hard prerequisite before per-tenant inbound numbers or outbound campaigns (Phase 3) go live. Post-call detection (B) was considered and rejected: it can't prevent credit burn and would need rework into A anyway.


## Project state
- Phase 0 complete: full v2 schema, RLS, seed data, design tokens.
- Phase 1 complete: onboarding is complete — all 5 steps live, step 5 places a real outbound call via /onboarding/call.
- Phase 2: Task 13 pushed to Phase 3. Task 17 pushed until funtionality available (each franchise has it's own unique phone number for inbound calls). Task 12, 16 is done. 
In progress: 
- (1) create_tenant seeds lead_statuses per tenant; (2) status is advance-only via sort_order, keyed on the contact, mapped from call_outcome.
- (2) Opt-out detection rides in the lead-extraction Groq call (opted_out/opt_out_phrase); apply_dnc sets do_not_contact + DNC status as an override, in the same webhook transaction.
- /webhook gates on event == "call_analyzed" and dedupes by provider_call_id (Retell sends 3 lifecycle events per call + may retry the same one)
- The handler is slow (Groq + DB); a cleaner long-term fix is returning 200 immediately and processing async via Inngest, so Retell never retries.
- Contact + child resolution is upsert-by-natural-key (contact by normalized phone, child by contact+name); normalize_phone returns None on anything not a clean US 10/11-digit number rather than fabricating an E.164.
- CSV export via /contacts/export; import via /contacts/import dedupes by normalized phone OR email, skips matches, source=imported_list; rows without phone/email can't dedupe (expected).
- Campaigns table + /campaigns (create draft) and /campaigns/audience (contacts by status, excludes DNC and null-phone). Audience = right status + reachable + not DNC.
- can_dial(contact, tenant) enforces TCPA — DNC, 8am–9pm local (tenant tz), max 2 attempts, 24h gap — checked in that order; pure function, no dialing.
- /campaigns/{id}/launch enqueues Inngest run_campaign; loops audience, re-checks can_dial per contact, dials via create-phone-call, writes a call_logs attempt (or skipped_<reason>); one pass, one attempt per contact, no auto-retry.
- Supabase Auth (email/password) wired on frontend; signup/login pages, useAuth hook + signOut built (not yet gating pages); confirmation off for dev.
- profiles table links auth user → tenant; /profiles/link (upsert on signup) + /profiles/{user_id}; signup requires a tenant_slug (redirects to onboarding without one) — no tenant-less accounts. 

- Done: