-- Destino de la transferencia (cuenta Delfi / Mechi); solo aplica si payment_method = 'transferencia'.
alter table public.sales
  add column if not exists transfer_destination text
  check (transfer_destination is null or transfer_destination in ('Delfi', 'Mechi'));

comment on column public.sales.transfer_destination is
  'Cuenta a la que ingresó la transferencia; null si no es transferencia o dato histórico sin cargar.';
