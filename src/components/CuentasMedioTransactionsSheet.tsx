import { CUENTAS_SOCIAS } from '../lib/cuentasMedioBalances'
import { formatCuentasPaymentSourceLabel } from '../lib/cuentasPaymentSources'
import type { CuentasSettlementOperation } from '../lib/cuentasSettlementsRepository'

type CuentasMedioTransactionsSheetProps = {
  formatArs: (value: number) => string
  formatDateTime: (iso: string) => string
  onClose: () => void
  operations: CuentasSettlementOperation[]
}

export default function CuentasMedioTransactionsSheet({
  formatArs,
  formatDateTime,
  onClose,
  operations,
}: CuentasMedioTransactionsSheetProps) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet detail-sheet--tall" onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <h2>Transacciones realizadas</h2>
            <p>Saldos de cuenta por medio de pago</p>
          </div>
          <button aria-label="Cerrar" className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="cuentas-tx-sheet-body">
          {operations.length === 0 ? (
            <p className="cuentas-empty">Todavía no hay saldos registrados.</p>
          ) : (
            <ul className="cuentas-tx-list">
              {operations.map((op) => (
                <li className="cuentas-tx-item" key={op.id}>
                  <div className="cuentas-tx-item-head">
                    <strong>{formatDateTime(op.createdAt)}</strong>
                    <span className="cuentas-tx-item-date">Operación · {op.settledOn}</span>
                  </div>

                  {op.payload.wonkyPayment ? (
                    <div className="cuentas-settle-partner-block cuentas-settle-partner-block--compact">
                      <h4>Wonky</h4>
                      <div className="sheet-list-item">
                        <span>Saldado</span>
                        <strong>{formatArs(op.payload.wonkyPayment.amountArs)}</strong>
                      </div>
                      <div className="sheet-list-item">
                        <span>Ejemplares</span>
                        <strong>{op.payload.wonkyPayment.copies}</strong>
                      </div>
                      <div className="sheet-list-item">
                        <span>Desde</span>
                        <strong>{formatCuentasPaymentSourceLabel(op.payload.wonkyPayment.source)}</strong>
                      </div>
                    </div>
                  ) : null}

                  {op.payload.partners.map((line) => (
                    <div className="cuentas-settle-partner-block cuentas-settle-partner-block--compact" key={line.partner}>
                      <h4>{line.partner}</h4>
                      <div className="sheet-list-item">
                        <span>Saldado</span>
                        <strong>{formatArs(line.settledArs)}</strong>
                      </div>
                      {line.fromEfectivoArs > 0 ? (
                        <div className="sheet-list-item">
                          <span>Efectivo</span>
                          <strong>{formatArs(line.fromEfectivoArs)}</strong>
                        </div>
                      ) : null}
                      {line.fromOwnBankArs > 0 ? (
                        <div className="sheet-list-item">
                          <span>Cuenta propia</span>
                          <strong>{formatArs(line.fromOwnBankArs)}</strong>
                        </div>
                      ) : null}
                      {line.fromPool.map((d) => (
                        <div className="sheet-list-item" key={`${line.partner}-bank-${d.account}`}>
                          <span>De cuenta {d.account}</span>
                          <strong>{formatArs(d.amountArs)}</strong>
                        </div>
                      ))}
                      {(line.fromEfectivoPool ?? []).map((d) => (
                        <div className="sheet-list-item" key={`${line.partner}-cash-${d.socia}`}>
                          <span>De efectivo {d.socia}</span>
                          <strong>{formatArs(d.amountArs)}</strong>
                        </div>
                      ))}
                    </div>
                  ))}

                  <p className="cuentas-settle-finals-sub">Saldos después de esta operación</p>
                  {CUENTAS_SOCIAS.map((p) => (
                    <div className="sheet-list-item" key={`${op.id}-ef-${p}`}>
                      <span>Efectivo · {p}</span>
                      <strong>{formatArs(op.payload.balancesAfter.efectivo[p])}</strong>
                    </div>
                  ))}
                  <div className="sheet-list-item">
                    <span>Banco · Delfi</span>
                    <strong>{formatArs(op.payload.balancesAfter.banco.Delfi)}</strong>
                  </div>
                  <div className="sheet-list-item">
                    <span>Banco · Mechi</span>
                    <strong>{formatArs(op.payload.balancesAfter.banco.Mechi)}</strong>
                  </div>
                </li>
              ))}
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
