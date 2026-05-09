-- Encargos según planillas: columnas Pagado y Entregado vacías.
-- Inserta filas nuevas y normaliza las existentes (sin cobro registrado, sin «SI» en entregado).

create temporary table _encargo_planilla (
  sold_at date not null,
  buyer text not null,
  seller text not null,
  quantity integer not null,
  unit_price_ars numeric not null
) on commit drop;

insert into _encargo_planilla (sold_at, buyer, seller, quantity, unit_price_ars)
values
  ('2026-05-06', 'Diana smo', 'Delfi', 1, 15000),
  ('2026-05-06', 'Ceci moore', 'Delfi', 1, 15000),
  ('2026-05-06', 'Mary Barales', 'Delfi', 1, 15000),
  ('2026-05-06', 'Ele Perri', 'Delfi', 4, 12500),
  ('2026-05-06', 'Juan Carlos Cobreros', 'Susan', 3, 15000),
  ('2026-05-06', 'José Pallache', 'Susan', 1, 15000),
  ('2026-05-06', 'Sofía Mealla', 'Susan', 4, 12500),
  ('2026-05-06', 'Ignacio Leone', 'Susan', 1, 15000),
  ('2026-05-06', 'Inés Vergara', 'Susan', 3, 15000),
  ('2026-05-06', 'Mercedes Ponferrada', 'Susan', 1, 15000),
  ('2026-05-06', 'María Copello', 'Susan', 1, 15000),
  ('2026-05-06', 'Andrea Bianchi', 'Susan', 2, 15000),
  ('2026-05-06', 'Fabricio Cardozo', 'Susan', 1, 15000),
  ('2026-05-06', 'Silvina Kyric', 'Susan', 1, 15000),
  ('2026-05-06', 'Ma. Agustina Pardini', 'Susan', 1, 15000),
  ('2026-05-06', 'Carolina Ferrari', 'Susan', 1, 15000),
  ('2026-05-06', 'Maximiliano Majluf', 'Susan', 1, 15000),
  ('2026-05-06', 'Ma. Soledad Díaz', 'Susan', 1, 15000),
  ('2026-05-06', 'Valeria Epifanio', 'Susan', 1, 15000),
  ('2026-05-06', 'Mariana Bunge', 'Mechi', 5, 15000),
  ('2026-05-06', 'Sofi Morgan', 'Mechi', 1, 15000),
  ('2026-05-06', 'Caro Pons', 'Mechi', 1, 15000),
  ('2026-05-06', 'Diana Von Bernard', 'Mechi', 2, 15000),
  ('2026-05-06', 'Vicky Grondona', 'Mechi', 1, 15000),
  ('2026-05-06', 'Lucila Dellatorre', 'Mechi', 1, 15000),
  ('2026-05-06', 'Celeste', 'Mechi', 1, 15000),
  ('2026-05-06', 'Caro Grether', 'Mechi', 2, 15000),
  ('2026-05-06', 'Ana Botting', 'Mechi', 1, 15000),
  ('2026-05-06', 'Ana Casares', 'Mechi', 1, 15000),
  ('2026-05-06', 'Sabri Gallo', 'Mechi', 1, 15000),
  ('2026-05-06', 'Vicky', 'Mechi', 1, 15000),
  ('2026-05-06', 'Dolores Sosa', 'Mechi', 1, 15000),
  ('2026-05-06', 'Lucia Ugarte', 'Mechi', 1, 15000);

update public.sales s
set
  paid_ars = 0,
  payment_status = 'pendiente',
  delivered = null
from _encargo_planilla v
where lower(trim(s.buyer)) = lower(trim(v.buyer))
  and s.seller is not distinct from v.seller
  and s.quantity is not distinct from v.quantity
  and s.unit_price_ars is not distinct from v.unit_price_ars;

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
  billing_notes,
  invoice_status
)
select
  v.sold_at,
  v.buyer,
  v.seller,
  v.quantity,
  v.unit_price_ars,
  'otro',
  'pendiente',
  0,
  null,
  null,
  'pendiente'
from _encargo_planilla v
where not exists (
  select 1
  from public.sales s
  where lower(trim(s.buyer)) = lower(trim(v.buyer))
    and s.seller is not distinct from v.seller
    and s.quantity is not distinct from v.quantity
    and s.unit_price_ars is not distinct from v.unit_price_ars
);
