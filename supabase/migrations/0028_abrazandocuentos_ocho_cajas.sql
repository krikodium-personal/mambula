-- Abrazandocuentos: 8 cajas (320 ej. @ 40/caja). Las cajas no asignadas a filas del inventario cuentan como stock sin asignar en la UI.
update public.stock_allocations
set copies = 320,
    boxes = 8
where name = 'Abrazandocuentos';
