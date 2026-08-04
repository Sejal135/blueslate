-- 10_campaigns.sql
-- Campaign records: named, goal-driven audience definitions for outbound sends (Phase 2/3).
-- No dialing/scheduling logic yet — this table just records intent + audience selection.

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  goal text not null,                 -- reengage_past_leads | fill_summer_camp | follow_up_trial | winback_inactive | follow_up_noshow | custom
  audience_status_key text,           -- lead_statuses.key defining the audience; null for custom/manual
  status text not null default 'draft', -- draft | scheduled | active | completed
  scheduled_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_campaigns_tenant on campaigns(tenant_id, created_at);

alter table campaigns enable row level security;
drop policy if exists tenant_isolation_campaigns on campaigns;
create policy tenant_isolation_campaigns on campaigns
  using (tenant_id = (current_setting('app.tenant_id', true))::uuid)
  with check (tenant_id = (current_setting('app.tenant_id', true))::uuid);

grant select, insert, update, delete on public.campaigns to service_role;
