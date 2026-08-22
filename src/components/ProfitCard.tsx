const arsIntegerFormatter = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

const fmtAR = (n: number) => '$\u00A0' + arsIntegerFormatter.format(Math.round(n))

const fmtSigned = (n: number) => {
  const rounded = Math.round(n)
  return (rounded < 0 ? '-' : '') + '$\u00A0' + arsIntegerFormatter.format(Math.abs(rounded))
}

export type ProfitSociaInput = {
  nombre: string
  ingresos: number
  gastos: number
  /** Suma de movimientos de saldo a esta socia. */
  saldado: number
}

const PROFIT_AVATAR_SLUGS = new Set(['delfi', 'mechi', 'susan', 'wonky'])

function ProfitCardAvatar({ name }: { name: string }) {
  const raw = name.trim().toLowerCase().replace(/\s+/g, '-')
  const slug = PROFIT_AVATAR_SLUGS.has(raw) ? raw : 'otro'

  return (
    <div aria-hidden className={`profit-card-avatar profit-card-avatar--${slug}`}>
      {name.trim().slice(0, 1).toUpperCase()}
    </div>
  )
}

export default function ProfitCard({ socias }: { socias: ProfitSociaInput[] }) {
  const rows = socias.map((s) => {
    return {
      ...s,
      profit: s.ingresos - s.gastos,
      porSaldar: s.ingresos - s.saldado,
    }
  })
  const totalProfit = rows.reduce((sum, p) => sum + p.profit, 0)

  return (
    <div className="profit-card">
      <div className="profit-card-header">
        <div className="profit-card-eyebrow">Resumen</div>
        <div className="profit-card-title">Profit</div>
        <p className="profit-card-lead">
          Por socia: <strong>ingresos</strong> son libros (total de cada venta menos $750 a Wonky por
          ejemplar) más shows cobrados (sin descuento Wonky), a tercios. Menos <strong>gastos</strong>.
          El <strong>saldado</strong> suma movimientos de saldo; <strong>por saldar</strong> es ingresos
          menos lo ya saldado.
        </p>
      </div>

      <div className="profit-card-hero-wrap">
        <div className="profit-card-hero">
          <div>
            <div className="profit-card-hero-label">Profit acumulado</div>
            <div className={`profit-card-hero-total ${totalProfit < 0 ? 'is-negative' : ''}`}>
              {fmtSigned(totalProfit)}
            </div>
          </div>
          <div className="profit-card-hero-meta">
            {rows.length} socias
            <br />
            <span className="profit-card-hero-meta-sub">período actual</span>
          </div>
        </div>
      </div>

      <div className="profit-card-section-label">Por socia</div>

      <div className="profit-card-rows">
        {rows.map((p, i) => (
          <div className={`profit-card-row ${i === 0 ? 'is-first' : ''}`} key={p.nombre}>
            <div className="profit-card-row-head">
              <ProfitCardAvatar name={p.nombre} />
              <div className="profit-card-row-main">
                <div className="profit-card-row-titleline">
                  <span className="profit-card-row-name">{p.nombre}</span>
                  <span className={`profit-card-row-profit ${p.profit < 0 ? 'is-negative' : 'is-positive'}`}>
                    {fmtSigned(p.profit)}
                  </span>
                </div>
              </div>
            </div>

            <div className="profit-card-breakdown profit-card-breakdown--liquidaciones">
              <div>
                <div className="profit-card-metric-label">Ingresos</div>
                <div className="profit-card-metric-value">{fmtAR(p.ingresos)}</div>
              </div>
              <div>
                <div className="profit-card-metric-label">Gastos</div>
                <div className="profit-card-metric-value">− {fmtAR(p.gastos)}</div>
              </div>
            </div>

            <div className="profit-card-breakdown profit-card-breakdown--saldo">
              <div>
                <div className="profit-card-metric-label">Saldado</div>
                <div className="profit-card-metric-value">{fmtAR(p.saldado)}</div>
              </div>
              <div>
                <div className="profit-card-metric-label">Por saldar</div>
                <div
                  className={`profit-card-metric-value ${
                    p.porSaldar < 0 ? 'is-negative' : p.porSaldar > 0 ? 'is-positive' : ''
                  }`}
                >
                  {fmtSigned(p.porSaldar)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
