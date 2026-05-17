-- Encargos con estado explícito (distinto de pendiente en Ventas principales).
-- Criterio alineado al antiguo isEncargoSale: sin entregar (delivered ≠ 'si')
-- y saldo pendiente según cantidad × precio vs paid_ars, o datos incompletos.

alter table public.sales drop constraint if exists sales_payment_status_check;

update public.sales
set payment_status = 'encargo'
where lower(trim(coalesce(delivered, ''))) <> 'si'
  and (
    quantity is null
    or unit_price_ars is null
    or (
      coalesce(quantity, 0) * coalesce(unit_price_ars, 0) - coalesce(paid_ars, 0) > 0
      and not (
        coalesce(quantity, 0) * coalesce(unit_price_ars, 0) = 0
        and coalesce(paid_ars, 0) = 0
      )
    )
  );

alter table public.sales
  add constraint sales_payment_status_check
  check (payment_status in ('pendiente', 'parcial', 'cobrado', 'encargo'));

comment on column public.sales.payment_status is
  'pendiente|parcial|cobrado: ventas principales; encargo: pedido en lista Encargos (sin entregar, con saldo o datos incompletos).';
