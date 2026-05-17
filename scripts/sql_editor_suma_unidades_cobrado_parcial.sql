-- Suma total de unidades (`quantity`) en ventas con payment_status cobrado o parcial.
-- Alineado al KPI «Vendidos» de la app (sin encargos ni otros estados).
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run

SELECT COALESCE(SUM(quantity), 0)::bigint AS total_unidades
FROM public.sales
WHERE payment_status IN ('cobrado', 'parcial')
  AND quantity IS NOT NULL
  AND quantity > 0;

-- Desglose opcional por estado:
-- SELECT payment_status,
--        COUNT(*)::bigint AS filas,
--        COALESCE(SUM(quantity), 0)::bigint AS unidades
-- FROM public.sales
-- WHERE payment_status IN ('cobrado', 'parcial')
--   AND quantity IS NOT NULL
--   AND quantity > 0
-- GROUP BY payment_status
-- ORDER BY payment_status;
