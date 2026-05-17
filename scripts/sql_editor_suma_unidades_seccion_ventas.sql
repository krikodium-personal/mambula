-- Suma total de unidades que cuentan en la pestaña Ventas de la app:
-- todas las filas de `sales` EXCEPTO las que la app trata como Encargo (`isEncargoSale`).
--
-- Encargo (no entran en esta suma): sin entregar (`delivered` distinto de 'si')
-- y (`payment_status = 'encargo'` O regla legacy de saldo pendiente / datos incompletos).
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run

SELECT COALESCE(SUM(COALESCE(s.quantity, 0)), 0)::bigint AS total_unidades_seccion_ventas
FROM public.sales s
WHERE NOT (
    lower(trim(coalesce(s.delivered, ''))) <> 'si'
    AND (
      s.payment_status = 'encargo'
      OR s.quantity IS NULL
      OR s.unit_price_ars IS NULL
      OR (
        coalesce(s.quantity, 0) * coalesce(s.unit_price_ars, 0) - coalesce(s.paid_ars, 0) > 0
        AND NOT (
          coalesce(s.quantity, 0) * coalesce(s.unit_price_ars, 0) = 0
          AND coalesce(s.paid_ars, 0) = 0
        )
      )
    )
  );

-- Verificación opcional: filas en Ventas vs fuera (encargo)
-- SELECT
--   CASE
--     WHEN (
--       lower(trim(coalesce(s.delivered, ''))) <> 'si'
--       AND (
--         s.payment_status = 'encargo'
--         OR s.quantity IS NULL
--         OR s.unit_price_ars IS NULL
--         OR (
--           coalesce(s.quantity, 0) * coalesce(s.unit_price_ars, 0) - coalesce(s.paid_ars, 0) > 0
--           AND NOT (
--             coalesce(s.quantity, 0) * coalesce(s.unit_price_ars, 0) = 0
--             AND coalesce(s.paid_ars, 0) = 0
--           )
--         )
--       )
--     )
--       THEN 'encargo_lista_app'
--     ELSE 'ventas_lista_app'
--   END AS bucket,
--   COUNT(*)::bigint AS filas,
--   COALESCE(SUM(COALESCE(s.quantity, 0)), 0)::bigint AS unidades
-- FROM public.sales s
-- GROUP BY 1
-- ORDER BY 1;
