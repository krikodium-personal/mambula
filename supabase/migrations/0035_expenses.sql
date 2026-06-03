create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month text not null,
  concept text not null,
  pesos_ars numeric(14, 2),
  rate numeric(14, 4),
  usd numeric(14, 2) not null default 0,
  payer text not null check (payer in ('Delfi', 'Mechi', 'Susan')),
  created_at timestamptz not null default now()
);

create index if not exists expenses_created_idx on public.expenses (created_at desc);
create index if not exists expenses_year_month_idx on public.expenses (year desc, created_at desc);

alter table public.expenses enable row level security;

create policy "Read expenses"
  on public.expenses for select using (true);

create policy "Insert expenses"
  on public.expenses for insert with check (true);

grant select, insert on public.expenses to anon, authenticated;
