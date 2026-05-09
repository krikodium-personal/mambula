-- Orden de fila en la planilla Excel (VENTAS). NULL = ventas cargadas manualmente desde la app (al final).
alter table public.sales
  add column if not exists sheet_position integer null;
