-- Solo tres estados de facturación; migrar legado y nuevo default Pendiente.
update public.sales
set invoice_status = 'pendiente'
where invoice_status = 'no_facturado';

alter table public.sales drop constraint if exists sales_invoice_status_check;

alter table public.sales
  add constraint sales_invoice_status_check
  check (invoice_status in ('facturado', 'pendiente', 'no_aplica'));

alter table public.sales
  alter column invoice_status set default 'pendiente';
