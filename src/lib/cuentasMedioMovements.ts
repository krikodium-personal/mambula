import type { CuentasSocia } from './cuentasMedioBalances'
import { formatDateAr } from './dateFormat'
import type { CuentasPaymentSource } from './cuentasPaymentSources'
import type { CuentasSettlementOperation } from './cuentasSettlementsRepository'
import type { Sale } from '../types'

export type CuentasMedioEfectivoBucket = { medium: 'efectivo'; socia: CuentasSocia }

export type CuentasMedioTransferenciaBucket = {
  medium: 'transferencia'
  account: 'Delfi' | 'Mechi' | 'sinDefinir'
}

export type CuentasMedioBucket = CuentasMedioEfectivoBucket | CuentasMedioTransferenciaBucket

export type CuentasMedioSaleMovement = {
  kind: 'sale'
  id: string
  sortKey: string
  sale: Sale
  amountArs: number
}

export type CuentasMedioDebitMovement = {
  kind: 'debit'
  id: string
  sortKey: string
  label: string
  meta: string
  amountArs: number
  settledOn: string
}

export type CuentasMedioMovement = CuentasMedioSaleMovement | CuentasMedioDebitMovement

function operationSortKey(op: CuentasSettlementOperation): string {
  return `${op.settledOn}T23:59:59`
}

function matchesBucket(bucket: CuentasMedioBucket, source: CuentasPaymentSource): boolean {
  if (bucket.medium === 'efectivo') {
    return source.kind === 'efectivo' && source.socia === bucket.socia
  }

  return source.kind === 'transferencia' && source.account === bucket.account
}

export function collectCuentasMedioMovements(
  bucket: CuentasMedioBucket,
  sales: Sale[],
  operations: CuentasSettlementOperation[],
): CuentasMedioMovement[] {
  const movements: CuentasMedioMovement[] = []

  for (const sale of sales) {
    movements.push({
      kind: 'sale',
      id: `sale:${sale.id}`,
      sortKey: sale.date,
      sale,
      amountArs: sale.paidArs,
    })
  }

  const chronological = [...operations].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  for (const op of chronological) {
    const sortKey = operationSortKey(op)

    if (op.payload.wonkyPayment) {
      const payment = op.payload.wonkyPayment
      if (matchesBucket(bucket, payment.source) && payment.amountArs > 0) {
        movements.push({
          kind: 'debit',
          id: `op:${op.id}:wonky`,
          sortKey,
          label: 'Saldo Wonky',
          meta: `${payment.copies} ${payment.copies === 1 ? 'ejemplar' : 'ejemplares'} · ${formatDateAr(op.settledOn)}`,
          amountArs: payment.amountArs,
          settledOn: op.settledOn,
        })
      }
    }

    for (const line of op.payload.partners) {
      if (line.settledArs <= 0) continue

      if (bucket.medium === 'efectivo') {
        if (line.partner === bucket.socia && line.fromEfectivoArs > 0) {
          movements.push({
            kind: 'debit',
            id: `op:${op.id}:ef:${line.partner}`,
            sortKey,
            label: `Saldo cuenta · ${line.partner}`,
            meta: formatDateAr(op.settledOn),
            amountArs: line.fromEfectivoArs,
            settledOn: op.settledOn,
          })
        }

        for (const debit of line.fromEfectivoPool ?? []) {
          if (debit.socia !== bucket.socia || debit.amountArs <= 0) continue

          movements.push({
            kind: 'debit',
            id: `op:${op.id}:ef-pool:${line.partner}:${debit.socia}`,
            sortKey,
            label: `Saldo cuenta · ${line.partner}`,
            meta: `${formatDateAr(op.settledOn)} · efectivo compartido`,
            amountArs: debit.amountArs,
            settledOn: op.settledOn,
          })
        }
      } else if (bucket.account !== 'sinDefinir') {
        if (line.partner === bucket.account && line.fromOwnBankArs > 0) {
          movements.push({
            kind: 'debit',
            id: `op:${op.id}:bank:${line.partner}`,
            sortKey,
            label: `Saldo cuenta · ${line.partner}`,
            meta: formatDateAr(op.settledOn),
            amountArs: line.fromOwnBankArs,
            settledOn: op.settledOn,
          })
        }

        for (const debit of line.fromPool) {
          if (debit.account !== bucket.account || debit.amountArs <= 0) continue

          movements.push({
            kind: 'debit',
            id: `op:${op.id}:bank-pool:${line.partner}:${debit.account}`,
            sortKey,
            label: `Saldo cuenta · ${line.partner}`,
            meta: `${formatDateAr(op.settledOn)} · cuenta compartida`,
            amountArs: debit.amountArs,
            settledOn: op.settledOn,
          })
        }
      }
    }
  }

  return movements.sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)))
}

export function summarizeCuentasMedioMovements(movements: CuentasMedioMovement[]): {
  balanceArs: number
  creditCount: number
  debitCount: number
  summaryLabel: string
} {
  const creditCount = movements.filter((movement) => movement.kind === 'sale').length
  const debitCount = movements.filter((movement) => movement.kind === 'debit').length
  const balanceArs = movements.reduce(
    (sum, movement) => sum + (movement.kind === 'sale' ? movement.amountArs : -movement.amountArs),
    0,
  )

  const parts: string[] = []
  if (creditCount > 0) {
    parts.push(`${creditCount} ${creditCount === 1 ? 'ingreso' : 'ingresos'}`)
  }
  if (debitCount > 0) {
    parts.push(`${debitCount} ${debitCount === 1 ? 'salida' : 'salidas'}`)
  }

  return {
    balanceArs,
    creditCount,
    debitCount,
    summaryLabel: parts.length > 0 ? parts.join(' · ') : 'Sin movimientos',
  }
}
