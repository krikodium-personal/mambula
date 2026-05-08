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

export function soldUnitsAttributedToSeller(sales: Sale[], sellerName: string): number {
  return sales.reduce((sum, sale) => {
    if (sale.seller === sellerName && sale.quantity != null && Number.isFinite(sale.quantity)) {
      const q = Math.max(0, Math.floor(sale.quantity))
      return sum + q
    }
    return sum
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
