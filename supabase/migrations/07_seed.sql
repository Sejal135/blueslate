-- 07_seed.sql
-- Seed the two v1 pilot activities (Esports, Coding), their configs, brands,
-- and the global lead statuses. Then link your existing XP League Frisco tenant.
-- Re-runnable: every insert is guarded with ON CONFLICT DO NOTHING.

-- 1) Activities
insert into activities (key, name, default_voice_tone) values
  ('esports', 'Esports', 'energetic'),
  ('coding',  'Coding',  'warm_professional')
on conflict (key) do nothing;

-- 2) Activity config
insert into activity_config (activity_id, seasonal_calendar, program_structure,
  milestone_vocabulary, parent_concern_profile, content_vocabulary, age_range_norms, trial_structure)
select id,
  '{"peak":["summer","fall"],"off":["winter"]}'::jsonb,
  '{"unit":"seasons","levels":["rookie","competitive"]}'::jsonb,
  '{"win":"leveled up","team":"squad"}'::jsonb,
  '["performance","teamwork","screen-time balance"]'::jsonb,
  '{"energy":"high","cta":"Join the squad"}'::jsonb,
  '{"min":6,"max":17}'::jsonb,
  '{"type":"free_trial_session"}'::jsonb
from activities where key='esports'
on conflict (activity_id) do nothing;

insert into activity_config (activity_id, seasonal_calendar, program_structure,
  milestone_vocabulary, parent_concern_profile, content_vocabulary, age_range_norms, trial_structure)
select id,
  '{"peak":["summer"],"off":[]}'::jsonb,
  '{"unit":"courses","levels":["beginner","intermediate","advanced"]}'::jsonb,
  '{"win":"shipped a project","team":"class"}'::jsonb,
  '["future skills","screen-time value","career relevance"]'::jsonb,
  '{"energy":"warm","cta":"Start building"}'::jsonb,
  '{"min":7,"max":16}'::jsonb,
  '{"type":"free_intro_class"}'::jsonb
from activities where key='coding'
on conflict (activity_id) do nothing;

-- 3) Brands (+ an Independent operator option per activity)
insert into brands (activity_id, key, name, is_independent)
select id, 'xp_league', 'XP League', false from activities where key='esports'
on conflict (key) do nothing;

insert into brands (activity_id, key, name, is_independent)
select id, 'code_ninjas', 'Code Ninjas', false from activities where key='coding'
on conflict (key) do nothing;

insert into brands (activity_id, key, name, is_independent)
select id, 'independent_esports', 'Independent operator', true from activities where key='esports'
on conflict (key) do nothing;

insert into brands (activity_id, key, name, is_independent)
select id, 'independent_coding', 'Independent operator', true from activities where key='coding'
on conflict (key) do nothing;

-- 4) Lead statuses — 5 visible + system-only
insert into lead_statuses (tenant_id, key, label, color, is_visible, is_system, sort_order) values
  (null, 'new_lead',       'New lead',       '#0EA98B', true,  true, 1),
  (null, 'needs_callback', 'Needs callback', '#F5A623', true,  true, 2),
  (null, 'trial_booked',   'Trial booked',   '#0EA98B', true,  true, 3),
  (null, 'not_interested', 'Not interested', '#6B7280', true,  true, 4),
  (null, 'do_not_contact', 'Do not contact', '#F05A36', true,  true, 5),
  (null, 'voicemail_left',         'Voicemail left',         null, false, true, 10),
  (null, 'no_answer',              'No answer',              null, false, true, 11),
  (null, 'lapsed',                 'Lapsed',                 null, false, true, 12),
  (null, 'registration_link_sent', 'Registration link sent', null, false, true, 13),
  (null, 'trial_attended',         'Trial attended',         null, false, true, 14),
  (null, 'no_show',                'No show',                null, false, true, 15)
on conflict do nothing;

-- 5) Link your existing XP League Frisco tenant.
--    >>> FIRST run this to confirm your slug:   select id, slug, name from tenants;
--    >>> then replace the slug below and run this block.
update tenants set
  activity_id = (select id from activities where key='esports'),
  brand_id    = (select id from brands where key='xp_league'),
  agent_name  = coalesce(agent_name, 'XP League Frisco Assistant'),
  timezone    = coalesce(timezone, 'America/Chicago')
where slug = 'REPLACE_WITH_YOUR_TENANT_SLUG';
