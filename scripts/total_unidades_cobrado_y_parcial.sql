-- Total de unidades (quantity) en ventas con cobro total o con abono parcial.
--
-- Incluye:
--   - payment_status = 'cobrado'
--   - payment_status = 'parcial'
--   - Respaldo (datos previos a migración 0027): pendiente con paid_ars > 0
--
-- Ejecutar en SQL Editor de Supabase o: psql "$DATABASE_URL" -f scripts/total_unidades_cobrado_y_parcial.sql

SELECT COALESCE(SUM(quantity), 0)::bigint AS total_unidades
FROM public.sales
WHERE quantity IS NOT NULL
  AND quantity > 0
  AND (
    payment_status IN ('cobrado', 'parcial')
    OR (payment_status = 'pendiente' AND paid_ars > 0)
  );

-- Desglose opcional:
-- SELECT
--   CASE
--     WHEN payment_status = 'cobrado' THEN 'cobrado'
--     WHEN payment_status = 'parcial' THEN 'parcial'
--     WHEN payment_status = 'pendiente' AND paid_ars > 0 THEN 'pendiente_legacy_parcial'
--   END AS tipo,
--   COUNT(*)::bigint AS filas,
--   COALESCE(SUM(quantity), 0)::bigint AS unidades
-- FROM public.sales
-- WHERE quantity IS NOT NULL
--   AND quantity > 0
--   AND (
--     payment_status IN ('cobrado', 'parcial')
--     OR (payment_status = 'pendiente' AND paid_ars > 0)
--   )
-- GROUP BY 1
-- ORDER BY 1;
