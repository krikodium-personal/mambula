-- Alineación pagos / facturación con planillas (casos mal cargados en seeds).

-- Carol De Jong: pago parcial + facturado.
update public.sales
set
  paid_ars = 15000,
  payment_status = 'pendiente',
  invoice_status = 'facturado'
where buyer = 'Carol De Jong'
  and seller = 'Susan'
  and quantity = 2
  and unit_price_ars = 15000;

-- Susan · Mercado Pago · entregadas SI: cobro total según cantidad × precio (excepto Carol).
update public.sales
set
  paid_ars = quantity * unit_price_ars,
  payment_status = 'cobrado',
  invoice_status = 'facturado'
where seller = 'Susan'
  and lower(trim(coalesce(billing_notes, ''))) = 'mercado pago'
  and trim(lower(coalesce(delivered, ''))) = 'si'
  and buyer <> 'Carol De Jong';

-- Violeta Eskenazi: cobrada total; sin factura de respaldo (planilla).
update public.sales
set
  paid_ars = 15000,
  payment_status = 'cobrado',
  billing_notes = 'SIN FACTURA',
  invoice_status = 'pendiente'
where buyer = 'Violeta Eskenazi'
  and seller = 'Delfi'
  and quantity = 1;

-- Eleonora Buch: primer ingreso parcial + facturado.
update public.sales
set
  paid_ars = 15000,
  payment_status = 'pendiente',
  invoice_status = 'facturado'
where buyer = 'Eleonora Buch'
  and seller = 'Delfi'
  and quantity = 12;

-- Cata Perri (4 × 12.500): cobrada según planilla.
update public.sales
set
  paid_ars = 50000,
  payment_status = 'cobrado',
  invoice_status = 'facturado'
where buyer = 'Cata Perri'
  and seller = 'Delfi'
  and quantity = 4
  and unit_price_ars = 12500;

-- Teté: corregir línea de venta (12 × 12.500, cobrada total).
update public.sales
set
  quantity = 12,
  unit_price_ars = 12500,
  paid_ars = 150000,
  payment_status = 'cobrado',
  delivered = 'SI',
  invoice_status = 'facturado',
  billing_notes = null
where buyer = 'Teté'
  and seller = 'Delfi';
