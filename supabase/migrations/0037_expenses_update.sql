create policy "Update expenses"
  on public.expenses for update using (true) with check (true);

grant update on public.expenses to anon, authenticated;
