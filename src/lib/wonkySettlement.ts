import { WONKY_ARS_PER_VENTA_COPY } from '../data/partnerSplits'
import type { PartnerSettlement } from '../types'

export function isWonkyEjemplaresScope(scope: string | undefined | null): boolean {
  return typeof scope === 'string' && /^[1-9]\d*$/.test(scope)
}

/** Ejemplares ya saldados a Wonky (liquidación; excluye cuentas_medio). */
export function wonkySettledCopiesFromSettlements(settlements: PartnerSettlement[]): number {
  return settlements
    .filter((row) => row.partner === 'Wonky' && row.scope !== 'cuentas_medio')
    .reduce((sum, row) => {
      if (isWonkyEjemplaresScope(row.scope)) {
        return sum + Number(row.scope)
      }
      if ((row.scope ?? 'liquidacion') === 'liquidacion') {
        return sum + Math.round(row.amountArs / WONKY_ARS_PER_VENTA_COPY)
      }
      return sum
    }, 0)
}

export function wonkyLiquidacionSaldadoArs(settlements: PartnerSettlement[]): number {
  return settlements
    .filter((row) => row.partner === 'Wonky' && row.scope !== 'cuentas_medio')
    .reduce((sum, row) => sum + row.amountArs, 0)
}

export function wonkyLiquidacionSettlements(settlements: PartnerSettlement[]): PartnerSettlement[] {
  return settlements.filter((row) => row.partner === 'Wonky' && row.scope !== 'cuentas_medio')
}
