-- Permitir borrar registros de liquidación esquema AC desde la app (misma convención que select/insert).

create policy "Delete ac_scheme_sales" on public.ac_scheme_sales for delete using (true);

grant delete on public.ac_scheme_sales to anon, authenticated;
