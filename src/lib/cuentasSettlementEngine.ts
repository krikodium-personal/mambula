import { parseArsDraftAmount } from './arsInputFormat'
import {
  cloneCuentasBalances,
  CUENTAS_BANK_ACCOUNTS,
  CUENTAS_SOCIAS,
  SOCIAS_WITH_OWN_BANK,
  type CuentasBankAccount,
  type CuentasMedioBalances,
  type CuentasSocia,
} from './cuentasMedioBalances'

export type PoolDebit = { account: CuentasBankAccount; amountArs: number }

export type CuentasPartnerSettlementLine = {
  partner: CuentasSocia
  requestedArs: number
  settledArs: number
  fromEfectivoArs: number
  fromOwnBankArs: number
  fromPool: PoolDebit[]
}

export type CuentasSettlementQuestion =
  | {
      id: string
      kind: 'own_bank_shortfall'
      partner: CuentasSocia
      shortfallArs: number
      maxSettleArs: number
    }
  | {
      id: string
      kind: 'pool_shortfall'
      partner: CuentasSocia
      shortfallArs: number
      maxSettleArs: number
    }

export type CuentasSettlementDecisions = {
  ownBankShortfall: Partial<Record<CuentasSocia, 'use_pool' | 'partial_only'>>
  poolShortfall: Partial<Record<CuentasSocia, 'settle_available' | 'skip'>>
}

export type CuentasSettlementComputeResult = {
  lines: CuentasPartnerSettlementLine[]
  balancesAfter: CuentasMedioBalances
  questions: CuentasSettlementQuestion[]
}

function roundArs(n: number) {
  return Math.max(0, Math.round(n * 100) / 100)
}

function drainPoolAscending(
  balances: CuentasMedioBalances,
  remanente: number,
): { debits: PoolDebit[]; remaining: number } {
  let left = remanente
  const debits: PoolDebit[] = []
  const order = [...CUENTAS_BANK_ACCOUNTS].sort((a, b) => balances.banco[a] - balances.banco[b])

  for (const account of order) {
    if (left <= 0) break
    const available = balances.banco[account]
    if (available <= 0) continue

    const take = Math.min(available, left)
    debits.push({ account, amountArs: take })
    balances.banco[account] = roundArs(balances.banco[account] - take)
    left = roundArs(left - take)
  }

  return { debits, remaining: left }
}

function applyLineToBalances(balances: CuentasMedioBalances, line: CuentasPartnerSettlementLine) {
  balances.efectivo[line.partner] = roundArs(balances.efectivo[line.partner] - line.fromEfectivoArs)
  if (line.fromOwnBankArs > 0) {
    balances.banco[line.partner as CuentasBankAccount] = roundArs(
      balances.banco[line.partner as CuentasBankAccount] - line.fromOwnBankArs,
    )
  }
  for (const debit of line.fromPool) {
    balances.banco[debit.account] = roundArs(balances.banco[debit.account] - debit.amountArs)
  }
}

type TrySettleOutcome =
  | { ok: true; line: CuentasPartnerSettlementLine }
  | { ok: false; question: CuentasSettlementQuestion }

function trySettlePartner(
  partner: CuentasSocia,
  requestedArs: number,
  balances: CuentasMedioBalances,
  hasOwnBank: boolean,
  decisions: CuentasSettlementDecisions,
): TrySettleOutcome {
  const requested = roundArs(requestedArs)
  if (requested <= 0) {
    return {
      ok: true,
      line: {
        partner,
        requestedArs: 0,
        settledArs: 0,
        fromEfectivoArs: 0,
        fromOwnBankArs: 0,
        fromPool: [],
      },
    }
  }

  const work = cloneCuentasBalances(balances)

  const fromEfectivoArs = Math.min(work.efectivo[partner], requested)
  work.efectivo[partner] = roundArs(work.efectivo[partner] - fromEfectivoArs)

  let remanente = roundArs(requested - fromEfectivoArs)
  let fromOwnBankArs = 0
  const fromPool: PoolDebit[] = []

  if (hasOwnBank) {
    if (remanente > 0) {
      fromOwnBankArs = Math.min(work.banco[partner as CuentasBankAccount], remanente)
      work.banco[partner as CuentasBankAccount] = roundArs(
        work.banco[partner as CuentasBankAccount] - fromOwnBankArs,
      )
      remanente = roundArs(remanente - fromOwnBankArs)
    }

    if (remanente > 0) {
      const decision = decisions.ownBankShortfall[partner]
      if (!decision) {
        return {
          ok: false,
          question: {
            id: `own_bank:${partner}`,
            kind: 'own_bank_shortfall',
            partner,
            shortfallArs: remanente,
            maxSettleArs: roundArs(fromEfectivoArs + fromOwnBankArs),
          },
        }
      }

      if (decision === 'use_pool') {
        const drained = drainPoolAscending(work, remanente)
        fromPool.push(...drained.debits)
        remanente = drained.remaining

        if (remanente > 0) {
          const decisionPool = decisions.poolShortfall[partner]
          if (!decisionPool) {
            return {
              ok: false,
              question: {
                id: `pool:${partner}`,
                kind: 'pool_shortfall',
                partner,
                shortfallArs: remanente,
                maxSettleArs: roundArs(
                  fromEfectivoArs + fromOwnBankArs + fromPool.reduce((s, d) => s + d.amountArs, 0),
                ),
              },
            }
          }
          if (decisionPool === 'skip') {
            return {
              ok: true,
              line: {
                partner,
                requestedArs: requested,
                settledArs: 0,
                fromEfectivoArs: 0,
                fromOwnBankArs: 0,
                fromPool: [],
              },
            }
          }
        }
      }
    }
  } else if (remanente > 0) {
    const drained = drainPoolAscending(work, remanente)
    fromPool.push(...drained.debits)
    remanente = drained.remaining

    if (remanente > 0) {
      const decision = decisions.poolShortfall[partner]
      if (!decision) {
        return {
          ok: false,
          question: {
            id: `pool:${partner}`,
            kind: 'pool_shortfall',
            partner,
            shortfallArs: remanente,
            maxSettleArs: roundArs(
              fromEfectivoArs + fromPool.reduce((s, d) => s + d.amountArs, 0),
            ),
          },
        }
      }

      if (decision === 'skip') {
        return {
          ok: true,
          line: {
            partner,
            requestedArs: requested,
            settledArs: 0,
            fromEfectivoArs: 0,
            fromOwnBankArs: 0,
            fromPool: [],
          },
        }
      }
    }
  }

  const line: CuentasPartnerSettlementLine = {
    partner,
    requestedArs: requested,
    settledArs: roundArs(
      fromEfectivoArs + fromOwnBankArs + fromPool.reduce((s, d) => s + d.amountArs, 0),
    ),
    fromEfectivoArs,
    fromOwnBankArs,
    fromPool,
  }

  applyLineToBalances(balances, line)
  return { ok: true, line }
}

export function computeCuentasSettlement(
  requestedByPartner: Record<CuentasSocia, number>,
  initialBalances: CuentasMedioBalances,
  decisions: CuentasSettlementDecisions,
): CuentasSettlementComputeResult {
  const balances = cloneCuentasBalances(initialBalances)
  const questions: CuentasSettlementQuestion[] = []
  const lines: CuentasPartnerSettlementLine[] = []

  const order: CuentasSocia[] = [
    ...CUENTAS_SOCIAS.filter((p) => SOCIAS_WITH_OWN_BANK.has(p)),
    ...CUENTAS_SOCIAS.filter((p) => !SOCIAS_WITH_OWN_BANK.has(p)),
  ]

  for (const partner of order) {
    const outcome = trySettlePartner(
      partner,
      requestedByPartner[partner] ?? 0,
      balances,
      SOCIAS_WITH_OWN_BANK.has(partner),
      decisions,
    )

    if (!outcome.ok) {
      questions.push(outcome.question)
      return { lines, balancesAfter: balances, questions }
    }

    if (outcome.line.settledArs > 0) {
      lines.push(outcome.line)
    }
  }

  return { lines, balancesAfter: balances, questions: [] }
}

export function parseRequestedAmounts(draft: Record<CuentasSocia, string>): Record<CuentasSocia, number> {
  const out: Record<CuentasSocia, number> = { Delfi: 0, Mechi: 0, Susan: 0 }
  for (const partner of CUENTAS_SOCIAS) {
    const n = parseArsDraftAmount(draft[partner])
    if (Number.isFinite(n) && n > 0) out[partner] = Math.floor(n)
  }
  return out
}
