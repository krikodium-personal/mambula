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

export type Sale = {
  id: string
  date: string
  buyer: string
  seller: string | null
  quantity: number | null
  unitPriceArs: number | null
  paidArs: number
  paymentMethod: 'transferencia' | 'efectivo' | 'otro'
  paymentStatus: 'pendiente' | 'cobrado'
  invoiceStatus?: 'facturado' | 'no_facturado' | 'pendiente' | 'no_aplica'
  delivered?: string | null
  billingNotes?: string | null
}

export type SaleBreakdown = {
  grossArs: number
  abrazandoCuentosArs: number
  wonkyArs: number
  bookCostUsd: number
}
