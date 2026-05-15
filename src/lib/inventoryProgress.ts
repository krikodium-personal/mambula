import type { Sale } from '../types'
import type { PromoRowsStored } from './promocionalesStorage'

const SOC_STOCK_NAMES = ['Delfi', 'Mechi', 'Susan'] as const
export type SocStockName = (typeof SOC_STOCK_NAMES)[number]

function isSocStockName(name: string): name is SocStockName {
  return name === 'Delfi' || name === 'Mechi' || name === 'Susan'
}

export function flattenPromoRows(rows: PromoRowsStored) {
  return [...rows.equipo, ...rows.colaboracion, ...rows.influencers, ...rows.colegio]
}

/** Ejemplares ya entregados como promocional, contabilizados por socia que los sacó de su stock. */
export function promoDeliveredUnitsForSocia(rows: PromoRowsStored, socia: SocStockName): number {
  return flattenPromoRows(rows).reduce((sum, row) => {
    if (row.entregado && row.entregadoPor === socia) {
      return sum + row.unidades
    }
    return sum
  }, 0)
}

/** Promos entregados contados contra el stock de una socia (filas Delfi / Mechi / Susan). */
export function promoDeliveredUnitsForStockRow(rows: PromoRowsStored, rowName: string): number {
  if (!isSocStockName(rowName)) return 0
  return promoDeliveredUnitsForSocia(rows, rowName)
}

/** Unidades de venta como entero ≥ 0 (coerce seguro para datos legacy). */
export function saleQuantityFloor(sale: Pick<Sale, 'quantity'>): number {
  const raw = sale.quantity
  if (raw == null) return 0

  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(n)) return 0

  return Math.max(0, Math.floor(n))
}

export function parseStockNumber(value: string | undefined) {
  const parsed = Number(value?.trim() ?? '')
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0
}

/** Ejemplares por fila de inventario = cajas × libros/caja (config de primera tirada). */
export function inventoryCopiesFromBoxes(boxesStr: string | undefined, copiesPerBox: number): number {
  if (!Number.isFinite(copiesPerBox) || copiesPerBox <= 0) return 0

  return Math.max(0, Math.round(parseStockNumber(boxesStr) * copiesPerBox))
}

export function soldUnitsAttributedToSeller(sales: Sale[], sellerName: string): number {
  const target = sellerName.trim()
  return sales.reduce((sum, sale) => {
    if (sale.seller?.trim() !== target) return sum
    return sum + saleQuantityFloor(sale)
  }, 0)
}

export type InventoryMovementBreakdown = {
  promo: number
  sold: number
  remainder: number
}

/**
 * Reparte las unidades asignadas en inventario entre promocional entregado, vendido y lo que queda.
 * Abrazandocuentos no usa promos; solo vendido + resto.
 */
export function breakdownInventoryMovement(
  allocationCopies: number,
  promoUnits: number,
  soldUnitsRaw: number,
  rowName: string,
): InventoryMovementBreakdown {
  const total = Math.max(0, Math.floor(allocationCopies))

  if (!isSocStockName(rowName)) {
    const sold = Math.min(Math.max(0, Math.floor(soldUnitsRaw)), total)
    return { promo: 0, sold, remainder: Math.max(0, total - sold) }
  }

  const promo = Math.min(Math.max(0, Math.floor(promoUnits)), total)
  const soldCap = Math.max(0, total - promo)
  const sold = Math.min(Math.max(0, Math.floor(soldUnitsRaw)), soldCap)
  const remainder = Math.max(0, total - promo - sold)

  return { promo, sold, remainder }
}
