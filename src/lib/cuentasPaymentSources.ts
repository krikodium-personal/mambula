import {
  cloneCuentasBalances,
  CUENTAS_BANK_ACCOUNTS,
  CUENTAS_SOCIAS,
  type CuentasBankAccount,
  type CuentasMedioBalances,
  type CuentasSocia,
} from './cuentasMedioBalances'

export type CuentasPaymentSource =
  | { kind: 'efectivo'; socia: CuentasSocia }
  | { kind: 'transferencia'; account: CuentasBankAccount }

export type CuentasSourceOption = {
  id: string
  source: CuentasPaymentSource
  label: string
  availableArs: number
}

function roundArs(n: number) {
  return Math.max(0, Math.round(n * 100) / 100)
}

export function formatCuentasPaymentSourceLabel(source: CuentasPaymentSource): string {
  if (source.kind === 'efectivo') return `Efectivo · ${source.socia}`
  return `Transferencia · ${source.account}`
}

export function listCuentasSourcesCoveringAmount(
  balances: CuentasMedioBalances,
  amountArs: number,
): CuentasSourceOption[] {
  const amount = roundArs(amountArs)
  if (amount <= 0) return []

  const options: CuentasSourceOption[] = []

  for (const socia of CUENTAS_SOCIAS) {
    const availableArs = balances.efectivo[socia]
    if (availableArs >= amount) {
      options.push({
        id: `efectivo:${socia}`,
        source: { kind: 'efectivo', socia },
        label: formatCuentasPaymentSourceLabel({ kind: 'efectivo', socia }),
        availableArs,
      })
    }
  }

  for (const account of CUENTAS_BANK_ACCOUNTS) {
    const availableArs = balances.banco[account]
    if (availableArs >= amount) {
      options.push({
        id: `transferencia:${account}`,
        source: { kind: 'transferencia', account },
        label: formatCuentasPaymentSourceLabel({ kind: 'transferencia', account }),
        availableArs,
      })
    }
  }

  return options.sort((a, b) => a.availableArs - b.availableArs)
}

export function applyPaymentSourceDebit(
  balances: CuentasMedioBalances,
  source: CuentasPaymentSource,
  amountArs: number,
): CuentasMedioBalances {
  const next = cloneCuentasBalances(balances)
  const amount = roundArs(amountArs)

  if (source.kind === 'efectivo') {
    next.efectivo[source.socia] = roundArs(next.efectivo[source.socia] - amount)
  } else {
    next.banco[source.account] = roundArs(next.banco[source.account] - amount)
  }

  return next
}
