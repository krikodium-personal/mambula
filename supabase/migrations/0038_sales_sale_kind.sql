-- Distingue ventas de libros vs shows (ingresos sin ejemplares de inventario).
alter table public.sales
  add column if not exists sale_kind text not null default 'libros';

alter table public.sales drop constraint if exists sales_sale_kind_check;

alter table public.sales
  add constraint sales_sale_kind_check
  check (sale_kind in ('libros', 'shows'));

comment on column public.sales.sale_kind is
  'libros = venta de ejemplares; shows = ingreso por show (sin unidades/vendedor/entrega).';
