-- 08_kb_jobs.sql
-- Tracks async KB ingestion runs so the onboarding UI can poll progress.

create table if not exists kb_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_type text not null default 'scrape',   -- scrape | upload | voice (later in Phase 1)
  source_ref text,                               -- the URL, filename, etc.
  status text not null default 'queued',         -- queued | scraping | extracting | merging | completed | failed
  message text,                                  -- human-friendly progress line for the UI
  structured_data jsonb,                         -- final extracted KB (on completion)
  error text,                                    -- error detail (on failure)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_kb_jobs_tenant on kb_jobs(tenant_id, created_at);

alter table kb_jobs enable row level security;
drop policy if exists tenant_isolation_kb_jobs on kb_jobs;
create policy tenant_isolation_kb_jobs on kb_jobs
  using (tenant_id = (current_setting('app.tenant_id', true))::uuid)
  with check (tenant_id = (current_setting('app.tenant_id', true))::uuid);

-- after create table + RLS policy:
grant select, insert, update, delete on public.kb_jobs to service_role;