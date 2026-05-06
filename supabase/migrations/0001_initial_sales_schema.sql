create table if not exists public.project_settings (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  first_print_copies integer not null check (first_print_copies >= 0),
  first_print_boxes integer not null check (first_print_boxes >= 0),
  abrazando_cuentos_share numeric(5, 4) not null check (abrazando_cuentos_share >= 0),
  wonky_share numeric(5, 4) not null check (wonky_share >= 0),
  book_cost_usd numeric(10, 2) not null check (book_cost_usd >= 0),
  payment_provider text not null,
  payment_alias text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_allocations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  copies integer not null check (copies >= 0),
  boxes integer not null check (boxes >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  sold_at date not null,
  buyer text not null,
  seller text not null,
  quantity integer not null check (quantity > 0),
  unit_price_ars numeric(12, 2) not null check (unit_price_ars >= 0),
  payment_method text not null check (payment_method in ('transferencia', 'efectivo', 'otro')),
  payment_status text not null check (payment_status in ('pendiente', 'cobrado')),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.project_settings enable row level security;
alter table public.stock_allocations enable row level security;
alter table public.sales enable row level security;

create policy "Read project settings" on public.project_settings
  for select using (true);

create policy "Read stock allocations" on public.stock_allocations
  for select using (true);

create policy "Read sales" on public.sales
  for select using (true);

insert into public.project_settings (
  project_name,
  first_print_copies,
  first_print_boxes,
  abrazando_cuentos_share,
  wonky_share,
  book_cost_usd,
  payment_provider,
  payment_alias
)
values (
  'Mambula',
  2000,
  50,
  0.5,
  0.05,
  3,
  'Mercado Pago',
  'mambula.canciones'
)
on conflict do nothing;

insert into public.stock_allocations (name, copies, boxes)
values
  ('Promocionales', 80, 2),
  ('Abrazandocuentos', 320, 8),
  ('Mechi', 80, 2),
  ('Delfi', 1440, 36),
  ('Susan', 80, 2)
on conflict (name) do update set
  copies = excluded.copies,
  boxes = excluded.boxes;
