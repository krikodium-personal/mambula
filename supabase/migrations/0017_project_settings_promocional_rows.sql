-- Promocionales (listas por grupo + entregadoPor): persistencia compartida entre dispositivos.

alter table public.project_settings
  add column if not exists promocional_rows jsonb;

comment on column public.project_settings.promocional_rows is
  'JSON con equipo, colaboracion, influencers, colegio: [{ nombre, unidades, entregado, entregadoPor }]. NULL = usar sólo defaults/localStorage hasta el primer guardado.';
