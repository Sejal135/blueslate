-- 06_rls.sql
-- Enable RLS and add policies consistent with v1's pattern:
--   tenant_id = current_setting('app.tenant_id', true)::uuid
-- NOTE: `tenants` is intentionally left RLS-OFF (it is the bootstrap lookup you read
-- BEFORE you know which tenant you are). Don't enable RLS on it.

-- ---- Tenant-scoped tables -------------------------------------------------
alter table contacts      enable row level security;
alter table children      enable row level security;
alter table activity_log  enable row level security;
alter table credit_ledger enable row level security;

drop policy if exists tenant_isolation_contacts on contacts;
create policy tenant_isolation_contacts on contacts
  using (tenant_id = (current_setting('app.tenant_id', true))::uuid)
  with check (tenant_id = (current_setting('app.tenant_id', true))::uuid);

drop policy if exists tenant_isolation_children on children;
create policy tenant_isolation_children on children
  using (tenant_id = (current_setting('app.tenant_id', true))::uuid)
  with check (tenant_id = (current_setting('app.tenant_id', true))::uuid);

drop policy if exists tenant_isolation_activity_log on activity_log;
create policy tenant_isolation_activity_log on activity_log
  using (tenant_id = (current_setting('app.tenant_id', true))::uuid)
  with check (tenant_id = (current_setting('app.tenant_id', true))::uuid);

drop policy if exists tenant_isolation_credit_ledger on credit_ledger;
create policy tenant_isolation_credit_ledger on credit_ledger
  using (tenant_id = (current_setting('app.tenant_id', true))::uuid)
  with check (tenant_id = (current_setting('app.tenant_id', true))::uuid);

-- ---- lead_statuses: globals visible to all; custom rows tenant-scoped -----
alter table lead_statuses enable row level security;
drop policy if exists tenant_isolation_lead_statuses on lead_statuses;
create policy tenant_isolation_lead_statuses on lead_statuses
  using (tenant_id is null
         or tenant_id = (current_setting('app.tenant_id', true))::uuid)
  with check (tenant_id = (current_setting('app.tenant_id', true))::uuid);

-- ---- Global reference data: read by everyone, write by admin only ---------
alter table activities      enable row level security;
alter table activity_config enable row level security;
alter table brands          enable row level security;

drop policy if exists read_activities on activities;
create policy read_activities on activities for select using (true);

drop policy if exists read_activity_config on activity_config;
create policy read_activity_config on activity_config for select using (true);

drop policy if exists read_brands on brands;
create policy read_brands on brands for select using (true);
