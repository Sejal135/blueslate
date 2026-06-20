-- 01_activities.sql
-- Activity taxonomy as DATA (admin-configurable), never hardcoded enums.
-- These are GLOBAL reference tables shared across all tenants.

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,                 -- machine key: 'esports', 'coding'
  name text not null,                       -- display: 'Esports'
  default_voice_tone text,                  -- 'energetic', 'warm_professional', ...
  created_at timestamptz default now()
);

create table if not exists activity_config (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null unique references activities(id) on delete cascade,
  seasonal_calendar jsonb default '{}'::jsonb,
  program_structure jsonb default '{}'::jsonb,
  milestone_vocabulary jsonb default '{}'::jsonb,
  parent_concern_profile jsonb default '{}'::jsonb,
  content_vocabulary jsonb default '{}'::jsonb,
  age_range_norms jsonb default '{}'::jsonb,
  trial_structure jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  key text not null unique,                 -- 'xp_league', 'code_ninjas'
  name text not null,                       -- 'XP League'
  brand_kb jsonb default '{}'::jsonb,        -- pre-built brand knowledge base
  is_independent boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_brands_activity on brands(activity_id);
