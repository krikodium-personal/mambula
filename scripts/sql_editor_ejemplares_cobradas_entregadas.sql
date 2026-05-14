-- 2) Total de ejemplares en ventas cobradas Y marcadas como entregadas (delivered = SI/si).
--    Misma convención que la app: trim + lower.
--    Ejecutar en Supabase → SQL Editor.

SELECT COALESCE(SUM(quantity), 0)::bigint AS ejemplares_cobrado_entregado
FROM public.sales
WHERE quantity IS NOT NULL
  AND quantity > 0
  AND payment_status = 'cobrado'
  AND trim(lower(coalesce(delivered, ''))) = 'si';
