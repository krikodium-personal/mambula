import { useState } from 'react'
import type { CuentasMedioBalances } from '../lib/cuentasMedioBalances'
import type { CuentasPaymentSource } from '../lib/cuentasPaymentSources'
import type { CuentasSettlementOperation } from '../lib/cuentasSettlementsRepository'
import type { PartnerSettlement } from '../types'
import WonkyEjemplaresSettlementModal from './WonkyEjemplaresSettlementModal'
import WonkyLiquidacionTransactionsSheet from './WonkyLiquidacionTransactionsSheet'

type LiquidacionesVentasCardProps = {
  cuentasBalances: CuentasMedioBalances
  saldadoArs: number
  ejemplaresSaldados: number
  /** Misma cuenta que la StatCard «Vendidos»: cobrado + parcial. */
  ejemplaresVendidos: number
  wonkyPorEjemplarArs: number
  wonkySettlements: PartnerSettlement[]
  cuentasOperations: CuentasSettlementOperation[]
  formatArs: (value: number) => string
  formatDateTime: (iso: string) => string
  onSettleEjemplares: (input: {
    copies: number
    settledOn: string
    amountArs: number
    source: CuentasPaymentSource
  }) => Promise<void>
}

export default function LiquidacionesVentasCard({
  cuentasBalances,
  saldadoArs,
  ejemplaresSaldados,
  ejemplaresVendidos,
  wonkyPorEjemplarArs,
  wonkySettlements,
  cuentasOperations,
  formatArs,
  formatDateTime,
  onSettleEjemplares,
}: LiquidacionesVentasCardProps) {
  const [settleOpen, setSettleOpen] = useState(false)
  const [txOpen, setTxOpen] = useState(false)

  const totalArs = ejemplaresVendidos * wonkyPorEjemplarArs
  const ejemplaresPendientes = Math.max(0, ejemplaresVendidos - ejemplaresSaldados)
  const pctSaldado = totalArs > 0 ? (saldadoArs / totalArs) * 100 : 0
  const canSettle = ejemplaresPendientes > 0

  return (
    <>
      <div className="liquidaciones-ventas-card">
        <div className="liquidaciones-ventas-head liquidaciones-ventas-head--with-action">
          <div>
            <div className="liquidaciones-ventas-head-row">
              <div className="liquidaciones-ventas-eyebrow">LIQUIDACIÓN</div>
            </div>
            <div className="liquidaciones-ventas-title">WONKY</div>
          </div>
          <div className="liquidaciones-ventas-actions">
            <button
              className="row-edit-button"
              disabled={!canSettle}
              onClick={() => setSettleOpen(true)}
              type="button"
            >
              Saldar cuenta
            </button>
            <button className="liquidaciones-ventas-link" onClick={() => setTxOpen(true)} type="button">
              Ver transacciones
            </button>
          </div>
        </div>

        <div className="liquidaciones-ventas-hero-wrap">
          <div className="liquidaciones-ventas-hero">
            <div className="liquidaciones-ventas-hero-top">
              <div>
                <div className="liquidaciones-ventas-hero-label">Total</div>
                <div className="liquidaciones-ventas-hero-bruto">{formatArs(totalArs)}</div>
              </div>
              <div className="liquidaciones-ventas-hero-meta">
                {ejemplaresVendidos} ejemplares
                <br />
                <span className="liquidaciones-ventas-hero-meta-strong">
                  {formatArs(wonkyPorEjemplarArs)} / ejemplar
                </span>
                {ejemplaresSaldados > 0 ? (
                  <>
                    <br />
                    <span className="liquidaciones-ventas-hero-meta-strong">
                      {ejemplaresSaldados} saldados · {ejemplaresPendientes} pendientes
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="liquidaciones-ventas-progress-block">
              <div className="liquidaciones-ventas-progress-track liquidaciones-ventas-progress-track--fat">
                <div className="liquidaciones-ventas-progress-fill" style={{ width: `${pctSaldado}%` }} />
              </div>
              <div className="liquidaciones-ventas-progress-legend">
                <div>
                  <div className="liquidaciones-ventas-legend-row">
                    <span className="liquidaciones-ventas-dot liquidaciones-ventas-dot--green" />
                    <span className="liquidaciones-ventas-legend-label">Saldado</span>
                  </div>
                  <div className="liquidaciones-ventas-legend-value">{formatArs(saldadoArs)}</div>
                </div>
                <div className="liquidaciones-ventas-progress-legend-right">
                  <div className="liquidaciones-ventas-legend-row liquidaciones-ventas-legend-row-end">
                    <span className="liquidaciones-ventas-dot liquidaciones-ventas-dot--muted" />
                    <span className="liquidaciones-ventas-legend-label">Total</span>
                  </div>
                  <div className="liquidaciones-ventas-legend-value">{formatArs(totalArs)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {txOpen ? (
        <WonkyLiquidacionTransactionsSheet
          cuentasOperations={cuentasOperations}
          formatArs={formatArs}
          formatDateTime={formatDateTime}
          onClose={() => setTxOpen(false)}
          settlements={wonkySettlements}
        />
      ) : null}

      {settleOpen ? (
        <WonkyEjemplaresSettlementModal
          arsPerEjemplar={wonkyPorEjemplarArs}
          cuentasBalances={cuentasBalances}
          ejemplaresPendientes={ejemplaresPendientes}
          ejemplaresVendidos={ejemplaresVendidos}
          formatArs={formatArs}
          onClose={() => setSettleOpen(false)}
          onSubmit={async (input) => {
            await onSettleEjemplares(input)
            setSettleOpen(false)
          }}
        />
      ) : null}
    </>
  )
}
