-- Promocionales se gestiona en la pestaña dedicada; no forma parte de la división de inventario del Home.
delete from public.stock_allocations
where name = 'Promocionales';
