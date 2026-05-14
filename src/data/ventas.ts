import type { ProjectConfig, Sale, SaleBreakdown, StockAllocation } from '../types'

export const projectConfig: ProjectConfig = {
  projectName: 'Mambula',
  sectionName: 'Dashboard',
  firstPrintRun: {
    copies: 2000,
    boxes: 50,
  },
  costRules: {
    abrazandoCuentosShare: 0.5,
    wonkyShare: 0.05,
    bookCostUsd: 3,
  },
  payment: {
    provider: 'Mercado Pago',
    alias: 'mambula.canciones',
  },
}

export const stockAllocations: StockAllocation[] = [
  { name: 'Abrazandocuentos', copies: 1680, boxes: 42 },
  { name: 'Mechi', copies: 80, boxes: 2 },
  { name: 'Delfi', copies: 160, boxes: 4 },
  { name: 'Susan', copies: 80, boxes: 2 },
]

export const sales: Sale[] = []

export function calculateSaleBreakdown(
  sale: Sale,
  config: ProjectConfig = projectConfig,
): SaleBreakdown {
  const quantity = sale.quantity ?? 0
  const unitPriceArs = sale.unitPriceArs ?? 0
  const grossArs = quantity * unitPriceArs

  return {
    grossArs,
    abrazandoCuentosArs: grossArs * config.costRules.abrazandoCuentosShare,
    wonkyArs: grossArs * config.costRules.wonkyShare,
    bookCostUsd: quantity * config.costRules.bookCostUsd,
  }
}
