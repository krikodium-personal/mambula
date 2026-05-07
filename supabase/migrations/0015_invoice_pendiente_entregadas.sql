-- Ventas marcadas como entregadas pasan a facturación Pendiente.
update public.sales
set invoice_status = 'pendiente'
where lower(trim(coalesce(delivered, ''))) = 'si';
