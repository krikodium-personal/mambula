import type { Sale } from '../types'

export function getSaleTotal(sale: Pick<Sale, 'quantity' | 'unitPriceArs'>): number {
  return (sale.quantity ?? 0) * (sale.unitPriceArs ?? 0)
}

export function getSalePending(sale: Pick<Sale, 'quantity' | 'unitPriceArs' | 'paidArs'>): number {
  const total = getSaleTotal(sale)

  if (total === 0 && sale.paidArs === 0) return 0

  return total - sale.paidArs
}

/**
 * Estado de cobro efectivo (alinea montos con `paid_ars` vs total de línea).
 * Útil cuando `payment_status` en BD quedó desactualizado pero el importe pagado está bien.
 */
export function getSaleStatus(sale: Sale): 'pagado' | 'parcial' | 'pendiente' {
  if (sale.paymentStatus === 'cobrado') return 'pagado'
  if (sale.paymentStatus === 'parcial') return 'parcial'

  if (sale.quantity === null || sale.unitPriceArs === null) return 'pendiente'

  const pending = getSalePending(sale)

  if (pending <= 0) return 'pagado'

  return sale.paidArs > 0 ? 'parcial' : 'pendiente'
}
