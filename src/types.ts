export type ProjectConfig = {
  projectName: string
  sectionName: string
  firstPrintRun: {
    copies: number
    boxes: number
  }
  costRules: {
    abrazandoCuentosShare: number
    wonkyShare: number
    bookCostUsd: number
  }
  payment: {
    provider: string
    alias: string
  }
}

export type StockAllocation = {
  name: string
  copies: number
  boxes: number
}

/** Alta de ventas en liquidación esquema Abrazandocuentos (persistido en `ac_scheme_sales`). */
export type AcSchemeSaleRecord = {
  id: string
  /** Fecha de la venta (YYYY-MM-DD). */
  soldAt: string
  /** Monto referencial registrado (cantidad × precio referencia AC). */
  amountArs: number
  quantity: number
}

/** Cuenta destino cuando el cobro fue por transferencia. */
export type SaleTransferDestination = 'Delfi' | 'Mechi'

export type Sale = {
  id: string
  date: string
  buyer: string
  seller: string | null
  quantity: number | null
  unitPriceArs: number | null
  paidArs: number
  /** Null = sin medio definido (válido si el cobro no está completo: pendiente o parcial). */
  paymentMethod: 'transferencia' | 'efectivo' | 'otro' | null
  /** Solo si `paymentMethod === 'transferencia'`; ventas viejas pueden tener null. */
  transferDestination: SaleTransferDestination | null
  /** `encargo`: lista Encargos (sin confundir con pendiente de Ventas). */
  paymentStatus: 'pendiente' | 'parcial' | 'cobrado' | 'encargo'
  invoiceStatus?: 'facturado' | 'pendiente' | 'no_aplica'
  delivered?: string | null
  billingNotes?: string | null
}

export type SaleBreakdown = {
  grossArs: number
  abrazandoCuentosArs: number
  wonkyArs: number
  bookCostUsd: number
}

export type SplitPartnerKey = 'Delfi' | 'Mechi' | 'Susan' | 'Wonky'

export type PartnerSettlementScope = 'liquidacion' | 'cuentas_medio'

export type PartnerSettlement = {
  id: string
  partner: SplitPartnerKey
  amountArs: number
  settledOn: string
  createdAt: string
  /** `liquidacion` | `cuentas_medio`, o cantidad de ejemplares (string numérica) para saldos Wonky. */
  scope?: PartnerSettlementScope | string
  operationId?: string | null
}

export type PartnerGainBreakdown = {
  partner: SplitPartnerKey
  totalGainArs: number
  fromVentasArs: number
  fromAbrazandoPoolArs: number
  wonkyIllustratorUsd?: number
}
