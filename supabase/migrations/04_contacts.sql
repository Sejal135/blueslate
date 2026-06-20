-- 04_contacts.sql
-- Parent-centric prospect funnel. Children are a lightweight per-parent array.
-- tenant_id is denormalized onto every child table so RLS stays uniform (no joins).

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,                               -- E.164, e.g. +12145550123
  email text,
  preferred_contact_method text,            -- 'sms' | 'call' | 'email'
  source text,                              -- inbound_call | outbound_campaign | imported_list | web_form | manual
  lead_status_id uuid references lead_statuses(id),
  sms_consent boolean default false,
  sms_consent_at timestamptz,
  do_not_contact boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_contacts_tenant_phone on contacts(tenant_id, phone);

create table if not exists children (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  name text,
  age int,
  program_interest text,
  created_at timestamptz default now()
);
create index if not exists idx_children_contact on children(contact_id);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  type text not null,                       -- call | sms | email | note | status_change
  direction text,                           -- inbound | outbound | null
  summary text,
  ref_id uuid,                              -- optional link to call_logs/leads/etc.
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_activity_log_contact on activity_log(contact_id, created_at);

-- Forward-link the v1 tables to the new contact entity (nullable, non-breaking).
alter table leads     add column if not exists contact_id uuid references contacts(id);
alter table call_logs add column if not exists contact_id uuid references contacts(id);
