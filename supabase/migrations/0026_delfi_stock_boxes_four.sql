-- Delfi: 4 cajas físicas @ 40 ejemplares/caja. Abrazandocuentos queda en 8 cajas (320 ej.); el resto va a stock sin asignar (ver 0028 si la BD ya tenía 42 cajas AC).

update public.stock_allocations
set copies = 160,
    boxes = 4
where name = 'Delfi';
