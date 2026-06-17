import type { Sale } from '../types'
import { saleQuantityFloor } from './inventoryProgress'

const AC_STOCK_NAME = 'Abrazandocuentos'
const ABRAZANDOCUENTOS_REFERENCE_UNIT_PRICE_ARS = 15000

export function isAcChannelSeller(seller: string | null | undefined): boolean {
  const normalized = seller?.trim() ?? ''
  return normalized === 'AC' || normalized === AC_STOCK_NAME
}

export function acChannelSales(sales: Sale[]): Sale[] {
  return sales.filter((sale) => isAcChannelSeller(sale.seller))
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
