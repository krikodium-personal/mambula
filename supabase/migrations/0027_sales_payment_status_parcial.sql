-- Estado explícito para cobros parciales (hasta completar → cobrado).

alter table public.sales drop constraint if exists sales_payment_status_check;

-- Corregir inconsistencias antes del nuevo check.
update public.sales
set payment_status = 'cobrado'
where payment_status = 'pendiente'
  and quantity is not null
  and unit_price_ars is not null
  and paid_ars >= quantity * unit_price_ars;

update public.sales
set payment_status = 'parcial'
where payment_status = 'pendiente'
  and paid_ars > 0
  and (
    quantity is null
    or unit_price_ars is null
    or paid_ars < quantity * unit_price_ars
  );

alter table public.sales
  add constraint sales_payment_status_check
  check (payment_status in ('pendiente', 'parcial', 'cobrado'));

comment on column public.sales.payment_method is
  'Medio si está definido; null permitido con payment_status pendiente o parcial.';
