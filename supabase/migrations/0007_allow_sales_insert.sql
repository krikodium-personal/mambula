alter table public.sales
  alter column buyer drop not null;

grant insert on public.sales to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sales'
      and policyname = 'Insert sales'
  ) then
    create policy "Insert sales" on public.sales
      for insert with check (true);
  end if;
end
$$;
