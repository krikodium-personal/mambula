-- Saldos de «Totales por medio de pago» (distinto de liquidación de ganancias).

alter table public.partner_settlements
  add column if not exists scope text not null default 'liquidacion';

alter table public.partner_settlements drop constraint if exists partner_settlements_scope_check;

alter table public.partner_settlements
  add constraint partner_settlements_scope_check
  check (scope in ('liquidacion', 'cuentas_medio'));

alter table public.partner_settlements
  add column if not exists operation_id uuid;

create table if not exists public.cuentas_settlement_operations (
  id uuid primary key default gen_random_uuid(),
  settled_on date not null,
  created_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists cuentas_settlement_operations_created_idx
  on public.cuentas_settlement_operations (created_at desc);

create index if not exists partner_settlements_cuentas_op_idx
  on public.partner_settlements (operation_id)
  where scope = 'cuentas_medio';

alter table public.cuentas_settlement_operations enable row level security;

create policy "Read cuentas settlement operations"
  on public.cuentas_settlement_operations for select using (true);

create policy "Insert cuentas settlement operations"
  on public.cuentas_settlement_operations for insert with check (true);

grant select, insert on public.cuentas_settlement_operations to anon, authenticated;
