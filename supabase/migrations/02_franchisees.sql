-- 02_franchisees.sql
-- Extend the existing v1 `tenants` table into the full franchisee record.
-- We keep the table name `tenants` and the `tenant_id` FK so all v1 code is untouched.
-- franchisee  ==  tenants (extended).

alter table tenants add column if not exists activity_id uuid references activities(id);
alter table tenants add column if not exists brand_id uuid references brands(id);
alter table tenants add column if not exists agent_name text;
alter table tenants add column if not exists voice_id text;                 -- Retell/ElevenLabs voice id
alter table tenants add column if not exists timezone text default 'America/Chicago';  -- needed for TCPA calling hours
alter table tenants add column if not exists phone_number text;             -- provisioned Twilio number
alter table tenants add column if not exists toggle_send_sms boolean default true;
alter table tenants add column if not exists toggle_alert_owner boolean default true;
alter table tenants add column if not exists toggle_followup_campaign boolean default true;
alter table tenants add column if not exists uses_external_crm boolean default false;
alter table tenants add column if not exists crm_webhook_url text;
alter table tenants add column if not exists onboarding_completed boolean default false;  -- go-live gate
