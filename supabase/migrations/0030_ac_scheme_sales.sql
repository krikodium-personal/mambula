-- Ventas del esquema Abrazandocuentos: una fila por alta con monto referencial y fecha.
-- Deja de usarse solo project_settings.ac_scheme_sold_units (se migra y limpia).

create table public.ac_scheme_sales (
  id uuid primary key default gen_random_uuid(),
  sold_at date not null,
  amount_ars numeric(12, 2) not null check (amount_ars >= 0),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index ac_scheme_sales_sold_at_idx on public.ac_scheme_sales (sold_at desc);

alter table public.ac_scheme_sales enable row level security;

create policy "Read ac_scheme_sales" on public.ac_scheme_sales for select using (true);

create policy "Insert ac_scheme_sales" on public.ac_scheme_sales for insert with check (true);

grant select, insert on public.ac_scheme_sales to anon, authenticated;

comment on table public.ac_scheme_sales is 'Liquidación esquema Abrazandocuentos: monto referencial y fecha por venta registrada.';
comment on column public.ac_scheme_sales.amount_ars is 'Ingreso referencial (cantidad × precio referencia AC, hoy 15000 ARS).';
comment on column public.ac_scheme_sales.quantity is 'Ejemplares de este movimiento.';

-- Migrar contador legacy a una fila (precio referencia alineado con la app: 15000 ARS/u).
insert into public.ac_scheme_sales (sold_at, amount_ars, quantity)
select current_date,
       (ps.ac_scheme_sold_units::numeric * 15000::numeric),
       ps.ac_scheme_sold_units::integer
from public.project_settings ps
where ps.ac_scheme_sold_units is not null
  and ps.ac_scheme_sold_units > 0;

update public.project_settings
set ac_scheme_sold_units = null
where ac_scheme_sold_units is not null
  and ac_scheme_sold_units > 0;
