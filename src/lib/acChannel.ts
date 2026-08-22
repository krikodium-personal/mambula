import type { Sale } from '../types'
import { WONKY_ARS_PER_VENTA_COPY, liquidacionVentasRevenueArs } from '../data/partnerSplits'
import { isSaleCobradoOrParcial, paidCopiesForSale, saleQuantityFloor } from './inventoryProgress'

const AC_STOCK_NAME = 'Abrazandocuentos'
const ABRAZANDOCUENTOS_REFERENCE_UNIT_PRICE_ARS = 15000

export function isAcChannelSeller(seller: string | null | undefined): boolean {
  const normalized = seller?.trim() ?? ''
  return normalized === 'AC' || normalized === AC_STOCK_NAME
}

export function acChannelSales(sales: Sale[]): Sale[] {
  return sales.filter((sale) => sale.kind !== 'shows' && isAcChannelSeller(sale.seller))
}

export function totalAcChannelSaleQuantity(sales: Sale[]): number {
  return acChannelSales(sales).reduce((sum, sale) => sum + saleQuantityFloor(sale), 0)
}

export function acChannelSaleGrossArs(
  sale: Sale,
  referenceUnitPriceArs: number = ABRAZANDOCUENTOS_REFERENCE_UNIT_PRICE_ARS,
): number {
  const qty = saleQuantityFloor(sale)
  if (qty <= 0) return 0

  const unit = sale.unitPriceArs
  if (unit != null && Number.isFinite(unit) && unit > 0) {
    return qty * unit
  }

  return qty * referenceUnitPriceArs
}

export function totalAcChannelSaleGrossArs(
  sales: Sale[],
  referenceUnitPriceArs: number = ABRAZANDOCUENTOS_REFERENCE_UNIT_PRICE_ARS,
): number {
  return acChannelSales(sales).reduce(
    (sum, sale) => sum + acChannelSaleGrossArs(sale, referenceUnitPriceArs),
    0,
  )
}

/**
 * Liquidación socias por ventas canal AC (vendedor AC):
 * total cobrado/parcial − $750 Wonky por ejemplar, resto ÷ 3.
 * No hay ganancia AC: ya está en el precio especial (p. ej. $6750).
 */
export function computeAcChannelSociasLiq(sales: Sale[]): {
  soldQty: number
  grossArs: number
  wonkyArs: number
  sociasPoolArs: number
  gananciaPorSociaArs: number
} {
  const scoped = acChannelSales(sales).filter((sale) => isSaleCobradoOrParcial(sale))

  const soldQty = scoped.reduce((sum, sale) => sum + paidCopiesForSale(sale), 0)
  const grossArs = scoped.reduce((sum, sale) => sum + liquidacionVentasRevenueArs(sale), 0)
  const wonkyArs = WONKY_ARS_PER_VENTA_COPY * soldQty
  const sociasPoolArs = Math.max(0, grossArs - wonkyArs)
  const gananciaPorSociaArs = sociasPoolArs / 3

  return {
    soldQty,
    grossArs,
    wonkyArs,
    sociasPoolArs,
    gananciaPorSociaArs,
  }
}
