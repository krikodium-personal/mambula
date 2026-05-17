import type { ReactNode } from 'react'

export type LiquidacionParticipanteVM = {
  nombre: string
  ganancia: number
  saldado: number
  pendiente: number
}

const AVATAR_PALETTE: Record<string, { bg: string; fg: string }> = {
  Delfi: { bg: '#FFE5D6', fg: '#B5481E' },
  Mechi: { bg: '#E0EEFF', fg: '#1F4FA8' },
  Susan: { bg: '#E5F5E0', fg: '#1F7A3A' },
  Wonky: { bg: '#F1E6FB', fg: '#5B2A9C' },
}

function Avatar({ name }: { name: string }) {
  const c = AVATAR_PALETTE[name] ?? { bg: 'var(--gray-fill)', fg: 'var(--label-2)' }

  return (
    <div
      aria-hidden
      className="liquidaciones-ventas-avatar"
      style={{ background: c.bg, color: c.fg }}
    >
      {name.slice(0, 1)}
    </div>
  )
}

type LiquidacionesVentasCardProps = {
  participantes: LiquidacionParticipanteVM[]
  totalCobradoArs: number
  /** Misma cuenta que la StatCard «Vendidos»: suma de cantidades con `payment_status` cobrado o parcial (no pendiente). */
  ejemplaresVendidos: number
  wonkyPorLibroArs: number
  formatArs: (value: number) => string
  explainExpanded: boolean
  onToggleExplain: () => void
  explainDetail: ReactNode
  onSaldar: (participante: LiquidacionParticipanteVM) => void
}

export default function LiquidacionesVentasCard({
  participantes,
  totalCobradoArs,
  ejemplaresVendidos,
  wonkyPorLibroArs,
  formatArs,
  explainExpanded,
  onToggleExplain,
  explainDetail,
  onSaldar,
}: LiquidacionesVentasCardProps) {
  const totalGanancia = participantes.reduce((s, p) => s + p.ganancia, 0)
  const totalSaldado = participantes.reduce((s, p) => s + p.saldado, 0)
  const pctSaldado = totalGanancia > 0 ? (totalSaldado / totalGanancia) * 100 : 0

  return (
    <div className="liquidaciones-ventas-card">
      <div className="liquidaciones-ventas-head">
        <div className="liquidaciones-ventas-head-row">
          <div className="liquidaciones-ventas-eyebrow">LIQUIDACION</div>
        </div>
        <div className="liquidaciones-ventas-title">Ventas Mambula</div>
        {explainExpanded ? (
          <>
            <div className="liquidaciones-ventas-explain-detail card-note">{explainDetail}</div>
            <div className="liquidaciones-ventas-explain-toggle-row">
              <button
                aria-expanded
                className="liquidaciones-ventas-ver-todo"
                onClick={onToggleExplain}
                type="button"
              >
                Ver menos
              </button>
            </div>
          </>
        ) : (
          <div className="liquidaciones-ventas-subtitle-row">
            <span className="liquidaciones-ventas-subtitle-text">
              Solo ventas <strong>cobradas</strong> y <strong>parciales</strong> (sin encargos). Total destacado: monto
              íntegro en cobradas + pagos registrados en parciales. Los ejemplares del bloque superior coinciden con la
              tarjeta <strong>Vendidos</strong> del inicio: suman las cantidades de todas las ventas cuyo{' '}
              <strong>payment_status</strong> en la base es cobrado o parcial (no pendiente). Reparto: cada socia (total
              liquidación − Wonky) / 3; Wonky = {formatArs(wonkyPorLibroArs)} por cada uno de esos ejemplares.
            </span>
            <button
              aria-expanded={false}
              className="liquidaciones-ventas-ver-todo"
              onClick={onToggleExplain}
              type="button"
            >
              Ver todo
            </button>
          </div>
        )}
      </div>

      <div className="liquidaciones-ventas-hero-wrap">
        <div className="liquidaciones-ventas-hero">
          <div className="liquidaciones-ventas-hero-top">
            <div>
              <div className="liquidaciones-ventas-hero-label">Total cobrado</div>
              <div className="liquidaciones-ventas-hero-bruto">{formatArs(totalCobradoArs)}</div>
            </div>
            <div className="liquidaciones-ventas-hero-meta">
              {ejemplaresVendidos} ejemplares
              <br />
              <span className="liquidaciones-ventas-hero-meta-strong">{participantes.length} participantes</span>
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
                <div className="liquidaciones-ventas-legend-value">{formatArs(totalSaldado)}</div>
              </div>
              <div className="liquidaciones-ventas-progress-legend-right">
                <div className="liquidaciones-ventas-legend-row liquidaciones-ventas-legend-row-end">
                  <span className="liquidaciones-ventas-dot liquidaciones-ventas-dot--muted" />
                  <span className="liquidaciones-ventas-legend-label">Total cobrado</span>
                </div>
                <div className="liquidaciones-ventas-legend-value">{formatArs(totalCobradoArs)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="liquidaciones-ventas-section-label">Por participante</div>

      <div className="liquidaciones-ventas-list">
        {participantes.map((p) => {
          const pct = p.ganancia > 0 ? (p.saldado / p.ganancia) * 100 : 0

          return (
            <div className="liquidaciones-ventas-row" key={p.nombre}>
              <div className="liquidaciones-ventas-row-inner">
                <Avatar name={p.nombre} />
                <div className="liquidaciones-ventas-row-body">
                  <div className="liquidaciones-ventas-row-title-line">
                    <span className="liquidaciones-ventas-part-name">{p.nombre}</span>
                    <span className="liquidaciones-ventas-part-gain">{formatArs(p.ganancia)}</span>
                  </div>
                  <div className="liquidaciones-ventas-row-micro">
                    <span>Ganancia</span>
                    <span>
                      Pendiente{' '}
                      <span className="liquidaciones-ventas-pendiente-strong">{formatArs(p.pendiente)}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="liquidaciones-ventas-row-actions">
                <div className="liquidaciones-ventas-progress-track liquidaciones-ventas-progress-track--thin">
                  <div
                    className="liquidaciones-ventas-progress-fill"
                    style={{
                      width: `${pct}%`,
                      background: pct > 0 ? 'var(--green)' : 'transparent',
                    }}
                  />
                </div>
                <button
                  className="liquidaciones-ventas-saldar-btn"
                  disabled={p.pendiente <= 0}
                  onClick={() => onSaldar(p)}
                  type="button"
                >
                  Saldar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
