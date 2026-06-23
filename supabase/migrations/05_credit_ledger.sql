-- 05_credit_ledger.sql
-- Append-only ledger. Balance = SUM(delta). Never a mutable counter field.

create table if not exists credit_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  credit_type text not null,                -- 'content' | 'voice' | 'video'
  delta numeric not null,                   -- + grant/topup, - consumption (0.5 allowed)
  reason text not null,                     -- signup_grant | monthly_reset | topup | image_generation | voice_minute | regeneration | rollover
  ref_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_credit_ledger_tenant_type on credit_ledger(tenant_id, credit_type);

-- Convenience balance view (runs with the caller's RLS via security_invoker).
create or replace view credit_balances with (security_invoker = true) as
select tenant_id, credit_type, sum(delta) as balance
from credit_ledger
group by tenant_id, credit_type;

-- Enforce append-only at the DB level. Triggers fire even for service_role.
create or replace function prevent_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'credit_ledger is append-only: % is not allowed', tg_op;
end;
$$;

drop trigger if exists trg_credit_ledger_no_mutation on credit_ledger;
create trigger trg_credit_ledger_no_mutation
  before update or delete on credit_ledger
  for each row execute function prevent_ledger_mutation();

grant select, insert, update, delete on public.credit_ledger to service_role;