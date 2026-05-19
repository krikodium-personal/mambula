import type { Sale, SplitPartnerKey } from '../types'

export const CUENTAS_SOCIAS = ['Delfi', 'Mechi', 'Susan'] as const satisfies readonly SplitPartnerKey[]
export type CuentasSocia = (typeof CUENTAS_SOCIAS)[number]

export const CUENTAS_BANK_ACCOUNTS = ['Delfi', 'Mechi'] as const
export type CuentasBankAccount = (typeof CUENTAS_BANK_ACCOUNTS)[number]

export const SOCIAS_WITH_OWN_BANK = new Set<CuentasSocia>(['Delfi', 'Mechi'])

export type CuentasMedioBalances = {
  efectivo: Record<CuentasSocia, number>
  banco: Record<CuentasBankAccount, number>
}

export type CuentasMedioGross = CuentasMedioBalances & {
  transferenciaSinDefinir: number
}

export function emptyCuentasBalances(): CuentasMedioBalances {
  return {
    efectivo: { Delfi: 0, Mechi: 0, Susan: 0 },
    banco: { Delfi: 0, Mechi: 0 },
  }
}

function normalizeSociaSeller(seller: string | null | undefined): CuentasSocia | null {
  const name = seller?.trim()
  if (name === 'Delfi' || name === 'Mechi' || name === 'Susan') return name
  return null
}

/** Saldos brutos desde ventas cobradas (antes de descontar saldos de cuenta). */
export function computeCuentasMedioGrossFromSales(sales: Sale[]): CuentasMedioGross {
  const balances = emptyCuentasBalances()
  let transferenciaSinDefinir = 0

  for (const sale of sales) {
    if (sale.paymentStatus !== 'cobrado') continue

    if (sale.paymentMethod === 'efectivo') {
      const socia = normalizeSociaSeller(sale.seller)
      if (socia) balances.efectivo[socia] += sale.paidArs
    } else if (sale.paymentMethod === 'transferencia') {
      if (sale.transferDestination === 'Delfi') balances.banco.Delfi += sale.paidArs
      else if (sale.transferDestination === 'Mechi') balances.banco.Mechi += sale.paidArs
      else transferenciaSinDefinir += sale.paidArs
    }
  }

  return { ...balances, transferenciaSinDefinir }
}

export function cloneCuentasBalances(b: CuentasMedioBalances): CuentasMedioBalances {
  return {
    efectivo: { ...b.efectivo },
    banco: { ...b.banco },
  }
}
