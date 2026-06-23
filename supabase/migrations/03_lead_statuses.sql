-- 03_lead_statuses.sql
-- Lead statuses as DATA: 5 visible globals + system-only states + room for per-tenant custom.
-- tenant_id NULL = global/system status shared by all tenants.
-- tenant_id set  = a custom status owned by one franchisee (up to 5 in the UI later).

create table if not exists lead_statuses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,  -- null = global
  key text not null,
  label text not null,
  color text,                               -- design-system hex token
  is_visible boolean default true,          -- shown as a tab in Contacts
  is_system boolean default false,          -- cannot be deleted by owner
  sort_order int default 0,
  created_at timestamptz default now()
);

-- global keys unique; custom keys unique per tenant
create unique index if not exists idx_lead_status_global_key
  on lead_statuses(key) where tenant_id is null;
create unique index if not exists idx_lead_status_tenant_key
  on lead_statuses(tenant_id, key) where tenant_id is not null;

grant select, insert, update, delete on public.lead_statuses to service_role;