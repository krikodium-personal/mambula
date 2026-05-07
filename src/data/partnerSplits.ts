import type {
  PartnerGainBreakdown,
  PartnerSettlement,
  ProjectConfig,
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

export function computeAbrazandoGananciasFromUnits(
  unitsSoldInScheme: number,
  costRules: ProjectConfig['costRules'],
  referenceUnitPriceArs: number = ABRAZANDOCUENTOS_REFERENCE_UNIT_PRICE_ARS,
): AbrazandoGananciasPreview {
  const q = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(Number(unitsSoldInScheme))))
  const poolGrossArs = q * referenceUnitPriceArs
  const pctAbrazando = costRules.abrazandoCuentosShare
  const pctWonky = costRules.wonkyShare
  const pctSocias = Math.max(0, 1 - pctAbrazando - pctWonky)
  const gananciaAbrazandoCuentosArs = poolGrossArs * pctAbrazando
  const gananciaWonkyArs = poolGrossArs * pctWonky
  const poolSociasArs = poolGrossArs * pctSocias
  const gananciaPorSociaAcArs = poolSociasArs / 3

  return {
    unitsInScheme: q,
    poolGrossArs,
    gananciaAbrazandoCuentosArs,
    gananciaWonkyArs,
    poolSociasArs,
    gananciaPorSociaAcArs,
  }
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
): AbrInventorySplit {
  const ac = stockAllocations.find((row) => row.name === AC_STOCK_NAME)
  const acCopies = ac?.copies ?? 0
  const acBoxes = ac?.boxes ?? 0
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

export function computeVentasMambulaSplits(
  grossSalesArs: number,
  totalSoldQty: number,
): PartnerGainBreakdown[] {
  const wonkyVentasArs = WONKY_ARS_PER_VENTA_COPY * totalSoldQty
  const sociasVentasPoolArs = Math.max(0, grossSalesArs - wonkyVentasArs)
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

export function settlementsTotalForPartner(settlements: PartnerSettlement[], partner: SplitPartnerKey): number {
  return settlements.filter((row) => row.partner === partner).reduce((sum, row) => sum + row.amountArs, 0)
}
