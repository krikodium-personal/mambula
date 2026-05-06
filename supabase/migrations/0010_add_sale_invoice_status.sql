alter table public.sales
  add column if not exists invoice_status text not null default 'no_aplica'
  check (invoice_status in ('facturado', 'no_facturado', 'pendiente', 'no_aplica'));
