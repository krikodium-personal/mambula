-- 1) Total de ejemplares (quantity) en ventas con cobro completo.
--    Ejecutar en Supabase → SQL Editor.

SELECT COALESCE(SUM(quantity), 0)::bigint AS ejemplares_cobrado
FROM public.sales
WHERE quantity IS NOT NULL
  AND quantity > 0
  AND payment_status = 'cobrado';
