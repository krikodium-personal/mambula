alter table public.sales
  alter column seller drop not null,
  alter column quantity drop not null,
  alter column unit_price_ars drop not null,
  alter column payment_method set default 'otro',
  alter column payment_status set default 'pendiente';

grant update on public.sales to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sales'
      and policyname = 'Update sales'
  ) then
    create policy "Update sales" on public.sales
      for update using (true) with check (true);
  end if;
end
$$;

insert into public.sales (
  sold_at,
  buyer,
  seller,
  quantity,
  unit_price_ars,
  payment_method,
  payment_status,
  paid_ars,
  delivered,
  billing_notes
)
values (
  '2026-05-06',
  'Sofi Magnasco',
  null,
  null,
  null,
  'otro',
  'pendiente',
  0,
  null,
  null
);
