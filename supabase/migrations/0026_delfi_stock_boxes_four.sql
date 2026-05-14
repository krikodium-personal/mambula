-- Delfi: 4 cajas físicas @ 40 ejemplares/caja (2000÷50); el resto de la tirada sigue coherente en Abrazandocuentos / socias.
update public.stock_allocations
set copies = 1680,
    boxes = 42
where name = 'Abrazandocuentos';

update public.stock_allocations
set copies = 160,
    boxes = 4
where name = 'Delfi';
