import { WONKY_ARS_PER_VENTA_COPY } from '../data/partnerSplits'
import { formatCuentasPaymentSourceLabel } from '../lib/cuentasPaymentSources'
import type { CuentasSettlementOperation } from '../lib/cuentasSettlementsRepository'
import { isWonkyEjemplaresScope } from '../lib/wonkySettlement'
import type { PartnerSettlement } from '../types'

type WonkyLiquidacionTransactionsSheetProps = {
  cuentasOperations: CuentasSettlementOperation[]
  formatArs: (value: number) => string
  formatDateTime: (iso: string) => string
  onClose: () => void
  settlements: PartnerSettlement[]
}

function ejemplaresFromSettlement(row: PartnerSettlement): number {
  if (isWonkyEjemplaresScope(row.scope)) return Number(row.scope)
  return Math.round(row.amountArs / WONKY_ARS_PER_VENTA_COPY)
}

export default function WonkyLiquidacionTransactionsSheet({
  cuentasOperations,
  formatArs,
  formatDateTime,
  onClose,
  settlements,
}: WonkyLiquidacionTransactionsSheetProps) {
  const opsById = new Map(
    cuentasOperations.filter((op) => op.payload.wonkyPayment).map((op) => [op.id, op]),
  )

  const rows = [...settlements].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet detail-sheet--tall" onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <h2>Transacciones · Wonky</h2>
            <p>Saldos de liquidación por ejemplares</p>
          </div>
          <button aria-label="Cerrar" className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="cuentas-tx-sheet-body">
          {rows.length === 0 ? (
            <p className="cuentas-empty">Todavía no hay saldos registrados.</p>
          ) : (
            <ul className="cuentas-tx-list">
              {rows.map((row) => {
                const op = row.operationId ? opsById.get(row.operationId) : undefined
                const payment = op?.payload.wonkyPayment
                const copies = payment?.copies ?? ejemplaresFromSettlement(row)

                return (
                  <li className="cuentas-tx-item" key={row.id}>
                    <div className="cuentas-tx-item-head">
                      <strong>{formatDateTime(row.createdAt)}</strong>
                      <span className="cuentas-tx-item-date">Operación · {row.settledOn}</span>
                    </div>
                    <div className="cuentas-settle-partner-block cuentas-settle-partner-block--compact">
                      <div className="sheet-list-item">
                        <span>Saldado</span>
                        <strong>{formatArs(row.amountArs)}</strong>
                      </div>
                      <div className="sheet-list-item">
                        <span>Ejemplares</span>
                        <strong>{copies}</strong>
                      </div>
                      {payment ? (
                        <div className="sheet-list-item">
                          <span>Desde</span>
                          <strong>{formatCuentasPaymentSourceLabel(payment.source)}</strong>
                        </div>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <button className="primary-button full" onClick={onClose} type="button">
          Cerrar
        </button>
      </div>
    </div>
  )
}
