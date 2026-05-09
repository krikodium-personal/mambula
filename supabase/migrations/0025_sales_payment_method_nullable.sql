-- Medio de pago opcional cuando el cobro sigue pendiente (sin definir en UI).
alter table public.sales alter column payment_method drop not null;

alter table public.sales drop constraint if exists sales_payment_method_check;

alter table public.sales
  add constraint sales_payment_method_check
  check (
    payment_method is null
    or payment_method in ('transferencia', 'efectivo', 'otro')
  );

comment on column public.sales.payment_method is
  'Medio si está definido; null permitido con payment_status pendiente.';
