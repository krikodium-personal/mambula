-- Persistencia del slider "ejemplares vendidos en esquema ABRAZANDOCUENTOS".
-- NULL = sin valor guardado (la UI usa el inventario AC como tope por defecto).

alter table public.project_settings
  add column if not exists ac_scheme_sold_units integer;

alter table public.project_settings
  drop constraint if exists project_settings_ac_scheme_sold_units_check;

alter table public.project_settings
  add constraint project_settings_ac_scheme_sold_units_check
  check (ac_scheme_sold_units is null or ac_scheme_sold_units >= 0);

comment on column public.project_settings.ac_scheme_sold_units is
  'Unidades contadas como vendidas en esquema ABRAZANDOCUENTOS; NULL = usar inventario AC como valor inicial.';

grant update on public.project_settings to anon, authenticated;

create policy "Update project settings" on public.project_settings
  for update
  using (true)
  with check (true);
