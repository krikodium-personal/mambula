grant update on public.stock_allocations to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stock_allocations'
      and policyname = 'Update stock allocations'
  ) then
    create policy "Update stock allocations" on public.stock_allocations
      for update using (true) with check (true);
  end if;
end
$$;
