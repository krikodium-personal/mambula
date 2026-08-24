import type { CuentasPartnerSettlementLine, CuentasSettlementComputeResult } from './cuentasSettlementEngine'
import {
  applyPaidSaleToCuentasBalances,
  clampCuentasBalances,
  cloneCuentasBalances,
  type CuentasMedioBalances,
} from './cuentasMedioBalances'
import { applyPaymentSourceDebit, type CuentasPaymentSource } from './cuentasPaymentSources'
import { createPartnerSettlement } from './partnerSettlementsRepository'
import { supabase } from './supabase'
import type { Sale, SplitPartnerKey } from '../types'

export type WonkyCuentasPayment = {
  copies: number
  amountArs: number
  source: CuentasPaymentSource
}

export type CuentasSettlementOperationPayload = {
  partners: CuentasPartnerSettlementLine[]
  balancesAfter: CuentasMedioBalances
  wonkyPayment?: WonkyCuentasPayment
}

export type CuentasSettlementOperation = {
  id: string
  settledOn: string
  createdAt: string
  payload: CuentasSettlementOperationPayload
}

type OperationRow = {
  id: string
  settled_on: string
  created_at: string
  payload: CuentasSettlementOperationPayload
}

const LS_KEY = 'mambula_cuentas_settlement_operations_v1'

function readLocal(): CuentasSettlementOperation[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CuentasSettlementOperation[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocal(rows: CuentasSettlementOperation[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows))
}

export async function loadCuentasSettlementOperations(): Promise<CuentasSettlementOperation[]> {
  if (!supabase) {
    return readLocal().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  const { data, error } = await supabase
    .from('cuentas_settlement_operations')
    .select('id, settled_on, created_at, payload')
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as OperationRow[]).map((row) => ({
    id: row.id,
    settledOn: row.settled_on,
    createdAt: row.created_at,
    payload: row.payload,
  }))
}

export async function persistCuentasSettlement(
  settledOn: string,
  result: CuentasSettlementComputeResult,
): Promise<CuentasSettlementOperation> {
  const payload: CuentasSettlementOperationPayload = {
    partners: result.lines.filter((l) => l.settledArs > 0),
    balancesAfter: clampCuentasBalances(result.balancesAfter),
  }

  if (!supabase) {
    const op: CuentasSettlementOperation = {
      id: crypto.randomUUID(),
      settledOn,
      createdAt: new Date().toISOString(),
      payload,
    }
    writeLocal([op, ...readLocal()])
    for (const line of payload.partners) {
      await createPartnerSettlement({
        partner: line.partner as SplitPartnerKey,
        amountArs: line.settledArs,
        settledOn,
        scope: 'cuentas_medio',
        operationId: op.id,
      })
    }
    return op
  }

  const { data, error } = await supabase
    .from('cuentas_settlement_operations')
    .insert({ settled_on: settledOn, payload })
    .select('id, settled_on, created_at, payload')
    .single()

  if (error) throw error

  const op = {
    id: data.id as string,
    settledOn: data.settled_on as string,
    createdAt: data.created_at as string,
    payload: data.payload as CuentasSettlementOperationPayload,
  }

  for (const line of payload.partners) {
    await createPartnerSettlement({
      partner: line.partner as SplitPartnerKey,
      amountArs: line.settledArs,
      settledOn,
      scope: 'cuentas_medio',
      operationId: op.id,
    })
  }

  return op
}

export async function persistWonkyCuentasSettlement(
  settledOn: string,
  payment: WonkyCuentasPayment,
  balancesBefore: CuentasMedioBalances,
): Promise<CuentasSettlementOperation> {
  const balancesAfter = applyPaymentSourceDebit(balancesBefore, payment.source, payment.amountArs)
  const payload: CuentasSettlementOperationPayload = {
    partners: [],
    balancesAfter,
    wonkyPayment: payment,
  }

  if (!supabase) {
    const op: CuentasSettlementOperation = {
      id: crypto.randomUUID(),
      settledOn,
      createdAt: new Date().toISOString(),
      payload,
    }
    writeLocal([op, ...readLocal()])
    return op
  }

  const { data, error } = await supabase
    .from('cuentas_settlement_operations')
    .insert({ settled_on: settledOn, payload })
    .select('id, settled_on, created_at, payload')
    .single()

  if (error) throw error

  return {
    id: data.id as string,
    settledOn: data.settled_on as string,
    createdAt: data.created_at as string,
    payload: data.payload as CuentasSettlementOperationPayload,
  }
}

function debitBucket(current: number, amount: number): number {
  return Math.max(0, current - Math.max(0, amount))
}

/** Saldos actuales: último snapshot de liquidación (nunca negativo) + ventas posteriores. */
export function applyCuentasOperationsToBalances(
  gross: CuentasMedioBalances,
  operations: CuentasSettlementOperation[],
  sales: Sale[] = [],
): CuentasMedioBalances {
  const chronological = [...operations].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const last = [...chronological].reverse().find((op) => op.payload?.balancesAfter)

  if (last?.payload.balancesAfter) {
    const balances = clampCuentasBalances(cloneCuentasBalances(last.payload.balancesAfter))

    for (const sale of sales) {
      if (sale.createdAt && sale.createdAt > last.createdAt) {
        applyPaidSaleToCuentasBalances(balances, sale)
      }
    }

    return clampCuentasBalances(balances)
  }

  const balances = cloneCuentasBalances(gross)

  for (const op of chronological) {
    if (op.payload.wonkyPayment) {
      const { source, amountArs } = op.payload.wonkyPayment
      const debited = applyPaymentSourceDebit(balances, source, amountArs)
      balances.efectivo = debited.efectivo
      balances.banco = debited.banco
    }

    for (const line of op.payload.partners) {
      balances.efectivo[line.partner] = debitBucket(balances.efectivo[line.partner], line.fromEfectivoArs)
      if (line.fromOwnBankArs > 0) {
        const key = line.partner as keyof typeof balances.banco
        if (key in balances.banco) {
          balances.banco[key] = debitBucket(balances.banco[key], line.fromOwnBankArs)
        }
      }
      for (const debit of line.fromPool) {
        balances.banco[debit.account] = debitBucket(balances.banco[debit.account], debit.amountArs)
      }
      for (const debit of line.fromEfectivoPool ?? []) {
        balances.efectivo[debit.socia] = debitBucket(balances.efectivo[debit.socia], debit.amountArs)
      }
    }
  }

  return clampCuentasBalances(balances)
}
