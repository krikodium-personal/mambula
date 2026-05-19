-- Saldos Wonky por ejemplares: `scope` guarda la cantidad saldada (texto numérico).

alter table public.partner_settlements drop constraint if exists partner_settlements_scope_check;

alter table public.partner_settlements
  add constraint partner_settlements_scope_check
  check (
    scope in ('liquidacion', 'cuentas_medio')
    or (scope ~ '^[1-9][0-9]*$')
  );
