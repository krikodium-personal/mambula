import {
  cloneCuentasBalances,
  roundCuentasBalances,
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

/** Una parte del pago y de qué cuenta sale. Un pago puede repartirse entre varias. */
export type CuentasPaymentAllocation = {
  source: CuentasPaymentSource
  amountArs: number
}

/** Redondea un importe a cobrar/pagar: nunca negativo. */
function roundArs(n: number) {
  return Math.max(0, Math.round(n * 100) / 100)
}

/** Redondea un saldo: puede quedar negativo si se retiró de más. */
function roundBalance(n: number) {
  return Math.round(n * 100) / 100
}

export function formatCuentasPaymentSourceLabel(source: CuentasPaymentSource): string {
  if (source.kind === 'efectivo') return `Efectivo · ${source.socia}`
  return `Transferencia · ${source.account}`
}

export function cuentasSourceId(source: CuentasPaymentSource): string {
  return source.kind === 'efectivo' ? `efectivo:${source.socia}` : `transferencia:${source.account}`
}

/** Todas las cuentas con plata, de menor a mayor saldo. */
export function listCuentasSourcesWithFunds(balances: CuentasMedioBalances): CuentasSourceOption[] {
  const options: CuentasSourceOption[] = []

  for (const socia of CUENTAS_SOCIAS) {
    const source: CuentasPaymentSource = { kind: 'efectivo', socia }
    const availableArs = balances.efectivo[socia]
    if (availableArs > 0) {
      options.push({
        id: cuentasSourceId(source),
        source,
        label: formatCuentasPaymentSourceLabel(source),
        availableArs,
      })
    }
  }

  for (const account of CUENTAS_BANK_ACCOUNTS) {
    const source: CuentasPaymentSource = { kind: 'transferencia', account }
    const availableArs = balances.banco[account]
    if (availableArs > 0) {
      options.push({
        id: cuentasSourceId(source),
        source,
        label: formatCuentasPaymentSourceLabel(source),
        availableArs,
      })
    }
  }

  return options.sort((a, b) => a.availableArs - b.availableArs)
}

/**
 * Reparte `amountArs` entre las cuentas elegidas, vaciando primero las de menor saldo
 * (mismo criterio que el reparto entre socias). `remainingArs > 0` significa que entre
 * todas las elegidas no alcanzan a cubrir el total.
 */
export function allocateAcrossSources(
  balances: CuentasMedioBalances,
  selectedIds: readonly string[],
  amountArs: number,
): { allocations: CuentasPaymentAllocation[]; remainingArs: number } {
  let left = roundArs(amountArs)
  const allocations: CuentasPaymentAllocation[] = []
  const selected = new Set(selectedIds)

  for (const option of listCuentasSourcesWithFunds(balances)) {
    if (left <= 0) break
    if (!selected.has(option.id)) continue

    const take = Math.min(option.availableArs, left)
    if (take <= 0) continue

    allocations.push({ source: option.source, amountArs: take })
    left = roundArs(left - take)
  }

  return { allocations, remainingArs: left }
}

/**
 * Selección por defecto: la cuenta más chica que cubra todo el monto ella sola. Si ninguna
 * alcanza, se van sumando cuentas de menor a mayor hasta llegar al total.
 */
export function defaultSourceSelectionForAmount(
  balances: CuentasMedioBalances,
  amountArs: number,
): string[] {
  const amount = roundArs(amountArs)
  if (amount <= 0) return []

  const options = listCuentasSourcesWithFunds(balances)
  const single = options.find((option) => option.availableArs >= amount)
  if (single) return [single.id]

  const selected: string[] = []
  let left = amount
  for (const option of options) {
    if (left <= 0) break
    selected.push(option.id)
    left = roundArs(left - option.availableArs)
  }

  return selected
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

export function applyPaymentSourceDebits(
  balances: CuentasMedioBalances,
  allocations: readonly CuentasPaymentAllocation[],
): CuentasMedioBalances {
  return allocations.reduce(
    (acc, allocation) => applyPaymentSourceDebit(acc, allocation.source, allocation.amountArs),
    cloneCuentasBalances(balances),
  )
}

export function applyPaymentSourceDebit(
  balances: CuentasMedioBalances,
  source: CuentasPaymentSource,
  amountArs: number,
): CuentasMedioBalances {
  const next = cloneCuentasBalances(balances)
  const amount = roundArs(amountArs)

  if (source.kind === 'efectivo') {
    next.efectivo[source.socia] = roundBalance(next.efectivo[source.socia] - amount)
  } else {
    next.banco[source.account] = roundBalance(next.banco[source.account] - amount)
  }

  return roundCuentasBalances(next)
}
