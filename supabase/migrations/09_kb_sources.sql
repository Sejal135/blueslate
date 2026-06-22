-- 09_kb_sources.sql
-- Each ingestion source is stored as its own layer. The active knowledge_base row
-- is recomputed by overlaying these layers in priority order (higher wins on
-- non-empty fields): voice(5) > upload(4) > scrape(3) > brand(2).

create table if not exists kb_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_type text not null,                     -- voice | upload | scrape | brand
  priority int not null,                         -- voice=5, upload=4, scrape=3, brand=2
  source_ref text,                               -- url / storage path
  raw_content text,                              -- the source's raw text (kept for re-merges)
  structured_data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One layer per source type per tenant; re-ingesting a source replaces its layer.
create unique index if not exists idx_kb_sources_tenant_type on kb_sources(tenant_id, source_type);

alter table kb_sources enable row level security;
drop policy if exists tenant_isolation_kb_sources on kb_sources;
create policy tenant_isolation_kb_sources on kb_sources
  using (tenant_id = (current_setting('app.tenant_id', true))::uuid)
  with check (tenant_id = (current_setting('app.tenant_id', true))::uuid);

grant select, insert, update, delete on public.kb_sources to service_role;