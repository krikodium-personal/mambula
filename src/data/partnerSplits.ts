import { inventoryCopiesFromBoxes } from '../lib/inventoryProgress'
import type {
  PartnerGainBreakdown,
  PartnerSettlement,
  ProjectConfig,
  Sale,
  SplitPartnerKey,
  StockAllocation,
} from '../types'

/** Wonky sobre ventas Mambula: ARS fijos por ejemplar (referencia ~15.000 ARS por libro). */
export const WONKY_ARS_PER_VENTA_COPY = 750
export const AC_STOCK_NAME = 'Abrazandocuentos'
/** Precio de venta usado solo para el ingreso referencial del pool Abrazandocuentos (ej. 320 × 15.000). */
export const ABRAZANDOCUENTOS_REFERENCE_UNIT_PRICE_ARS = 15000

const SOCIAS: SplitPartnerKey[] = ['Delfi', 'Mechi', 'Susan']

export type AbrInventorySplit = {
  acCopies: number
  acBoxes: number
  referenceUnitPriceArs: number
  poolGrossArs: number
  pctAbrazandoCuentos: number
  pctWonky: number
  pctSociasPool: number
  costoLibroUsd: number
  gananciaAbrazandoCuentosArs: number
  gananciaWonkyArs: number
  poolSociasArs: number
  gananciaPorSociaAcArs: number
}

/** Ganancias solo por cantidad de ejemplares vendidos en el esquema (slider). */
export type AbrazandoGananciasPreview = {
  unitsInScheme: number
  poolGrossArs: number
  gananciaAbrazandoCuentosArs: number
  gananciaWonkyArs: number
  poolSociasArs: number
  gananciaPorSociaAcArs: number
}

export function computeAbrazandoGananciasFromPoolGross(
  poolGrossArs: number,
  unitsInScheme: number,
  costRules: ProjectConfig['costRules'],
): AbrazandoGananciasPreview {
  const pool = Math.max(0, Number(poolGrossArs))
  const units = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(Number(unitsInScheme))))
  const pctAbrazando = costRules.abrazandoCuentosShare
  const pctWonky = costRules.wonkyShare
  const pctSocias = Math.max(0, 1 - pctAbrazando - pctWonky)
  const gananciaAbrazandoCuentosArs = pool * pctAbrazando
  const gananciaWonkyArs = pool * pctWonky
  const poolSociasArs = pool * pctSocias
  const gananciaPorSociaAcArs = poolSociasArs / 3

  return {
    unitsInScheme: units,
    poolGrossArs: pool,
    gananciaAbrazandoCuentosArs,
    gananciaWonkyArs,
    poolSociasArs,
    gananciaPorSociaAcArs,
  }
}

export function computeAbrazandoGananciasFromUnits(
  unitsSoldInScheme: number,
  costRules: ProjectConfig['costRules'],
  referenceUnitPriceArs: number = ABRAZANDOCUENTOS_REFERENCE_UNIT_PRICE_ARS,
): AbrazandoGananciasPreview {
  const q = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(Number(unitsSoldInScheme))))
  return computeAbrazandoGananciasFromPoolGross(q * referenceUnitPriceArs, q, costRules)
}

export function estimateArsPerUsdFromExpenseRates(rates: Array<number | null | undefined>): number {
  const clean = rates.filter((r): r is number => r != null && r > 0 && Number.isFinite(r))
  if (clean.length === 0) return 1450
  return clean.reduce((sum, r) => sum + r, 0) / clean.length
}

export function computeAbrInventorySplit(
  stockAllocations: StockAllocation[],
  costRules: ProjectConfig['costRules'],
  referenceUnitPriceArs: number = ABRAZANDOCUENTOS_REFERENCE_UNIT_PRICE_ARS,
  /** Si viene definido (> 0), `acCopies` se calcula desde cajas × ejemplares/caja (alineado con la card Inventario). */
  copiesPerBox?: number,
): AbrInventorySplit {
  const ac = stockAllocations.find((row) => row.name === AC_STOCK_NAME)
  const acBoxes = ac?.boxes ?? 0
  const acCopies =
    copiesPerBox !== undefined && Number.isFinite(copiesPerBox) && copiesPerBox > 0
      ? inventoryCopiesFromBoxes(String(acBoxes), copiesPerBox)
      : ac?.copies ?? 0
  const poolGrossArs = acCopies * referenceUnitPriceArs
  const pctAbrazandoCuentos = costRules.abrazandoCuentosShare
  const pctWonky = costRules.wonkyShare
  const pctSociasPool = Math.max(0, 1 - pctAbrazandoCuentos - pctWonky)
  const gananciaAbrazandoCuentosArs = poolGrossArs * pctAbrazandoCuentos
  const gananciaWonkyArs = poolGrossArs * pctWonky
  const poolSociasArs = poolGrossArs * pctSociasPool
  const gananciaPorSociaAcArs = poolSociasArs / 3

  return {
    acCopies,
    acBoxes,
    referenceUnitPriceArs,
    poolGrossArs,
    pctAbrazandoCuentos,
    pctWonky,
    pctSociasPool,
    costoLibroUsd: costRules.bookCostUsd,
    gananciaAbrazandoCuentosArs,
    gananciaWonkyArs,
    poolSociasArs,
    gananciaPorSociaAcArs,
  }
}

/**
 * Ingreso que entra en liquidación Ventas Mambula por fila (`payment_status` en BD):
 * - `cobrado`: total de la línea (cantidad × precio unitario).
 * - `parcial`: solo lo registrado en `paid_ars`.
 */
export function liquidacionVentasRevenueArs(
  sale: Pick<Sale, 'paymentStatus' | 'quantity' | 'unitPriceArs' | 'paidArs'>,
): number {
  if (sale.paymentStatus === 'cobrado') {
    const q = sale.quantity ?? 0
    const p = sale.unitPriceArs ?? 0

    return Math.max(0, q * p)
  }

  if (sale.paymentStatus === 'parcial') {
    return Math.max(0, sale.paidArs)
  }

  return 0
}

/** Reparto Ventas Mambula: socias en partes iguales tras descontar Wonky fijo por ejemplar (alineado a StatCard Vendidos = payment_status cobrado|parcial). */
export function computeVentasMambulaSplits(
  /** Total ARS base del reparto (en liquidación: cobrados al total de línea + parciales según `paid_ars`). */
  totalVentasArs: number,
  /** Ejemplares vendidos registrados (misma suma que StatCard Vendidos: cobrado + parcial). */
  ventasSoldQty: number,
): PartnerGainBreakdown[] {
  const wonkyVentasArs = WONKY_ARS_PER_VENTA_COPY * ventasSoldQty
  const sociasVentasPoolArs = Math.max(0, totalVentasArs - wonkyVentasArs)
  const sociasVentasEachArs = sociasVentasPoolArs / 3

  const sociaRows: PartnerGainBreakdown[] = SOCIAS.map((partner) => ({
    partner,
    totalGainArs: sociasVentasEachArs,
    fromVentasArs: sociasVentasEachArs,
    fromAbrazandoPoolArs: 0,
  }))

  const wonkyRow: PartnerGainBreakdown = {
    partner: 'Wonky',
    totalGainArs: wonkyVentasArs,
    fromVentasArs: wonkyVentasArs,
    fromAbrazandoPoolArs: 0,
  }

  return [...sociaRows, wonkyRow]
}

export function settlementsTotalForPartner(
  settlements: PartnerSettlement[],
  partner: SplitPartnerKey,
  scope: PartnerSettlement['scope'] = 'liquidacion',
): number {
  return settlements
    .filter((row) => row.partner === partner && (row.scope ?? 'liquidacion') === scope)
    .reduce((sum, row) => sum + row.amountArs, 0)
}
