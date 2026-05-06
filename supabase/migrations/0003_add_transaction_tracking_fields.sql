alter table public.sales
  add column if not exists paid_ars numeric(12, 2) not null default 0 check (paid_ars >= 0),
  add column if not exists delivered text,
  add column if not exists billing_notes text;
