-- Clasifica gastos entre libros y shows.
alter table public.expenses
  add column if not exists expense_kind text not null default 'libros';

alter table public.expenses drop constraint if exists expenses_expense_kind_check;

alter table public.expenses
  add constraint expenses_expense_kind_check
  check (expense_kind in ('libros', 'shows'));

comment on column public.expenses.expense_kind is
  'libros = costo de producción/libros; shows = costo asociado a shows.';
