-- 3) Total de ejemplares en ventas cobradas (cobrado) más ventas con pago parcial (parcial).
--    Ejecutar en Supabase → SQL Editor.

SELECT COALESCE(SUM(quantity), 0)::bigint AS ejemplares_cobrado_y_parcial
FROM public.sales
WHERE quantity IS NOT NULL
  AND quantity > 0
  AND payment_status IN ('cobrado', 'parcial');
