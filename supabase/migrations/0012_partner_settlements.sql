create table if not exists public.partner_settlements (
  id uuid primary key default gen_random_uuid(),
  partner text not null check (partner in ('Delfi', 'Mechi', 'Susan', 'Wonky')),
  amount_ars numeric(14, 2) not null check (amount_ars > 0),
  settled_on date not null,
  created_at timestamptz not null default now()
);

create index if not exists partner_settlements_partner_idx on public.partner_settlements (partner);

alter table public.partner_settlements enable row level security;

create policy "Read partner settlements"
  on public.partner_settlements for select using (true);

create policy "Insert partner settlements"
  on public.partner_settlements for insert with check (true);

grant select, insert on public.partner_settlements to anon, authenticated;
