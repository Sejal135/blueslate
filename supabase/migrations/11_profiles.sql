-- 11_profiles.sql
-- Links a Supabase Auth user to the tenant they claim (via signup after onboarding).
-- Linking only — no gating yet. One profile per user; a user is not yet
-- supported on multiple tenants.

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  created_at timestamptz default now()
);

grant select, insert, update, delete on public.profiles to service_role;
