grant delete on public.sales to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sales'
      and policyname = 'Delete sales'
  ) then
    create policy "Delete sales" on public.sales
      for delete using (true);
  end if;
end
$$;
