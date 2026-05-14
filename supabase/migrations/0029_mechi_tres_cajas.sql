-- Mechi: 3 cajas físicas × 40 ejemplares/caja = 120 ejemplares asignados.
update public.stock_allocations
set copies = 120,
    boxes = 3
where name = 'Mechi';
