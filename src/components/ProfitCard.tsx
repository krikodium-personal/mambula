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
  liqAC: number
  liqMambula: number
  gastos: number
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
  const rows = socias.map((s) => ({
    ...s,
    profit: s.liqAC + s.liqMambula - s.gastos,
  }))
  const totalProfit = rows.reduce((sum, p) => sum + p.profit, 0)

  return (
    <div className="profit-card">
      <div className="profit-card-header">
        <div className="profit-card-eyebrow">Resumen</div>
        <div className="profit-card-title">Profit</div>
        <p className="profit-card-lead">
          Por socia: ganancia del esquema <strong>Abrazandocuentos</strong> (parte del pool socias) más ganancia de{' '}
          <strong>Ventas Mambula</strong>, menos los <strong>gastos</strong> cargados en la pestaña Gastos.
        </p>
      </div>

      <div className="profit-card-hero-wrap">
        <div className="profit-card-hero">
          <div>
            <div className="profit-card-hero-label">Profit acumulado</div>
            <div className={`profit-card-hero-total ${totalProfit < 0 ? 'is-negative' : ''}`}>{fmtSigned(totalProfit)}</div>
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

            <div className="profit-card-breakdown">
              <div>
                <div className="profit-card-metric-label">Liq. AC</div>
                <div className="profit-card-metric-value">{fmtAR(p.liqAC)}</div>
              </div>
              <div>
                <div className="profit-card-metric-label">Liq. Mambula</div>
                <div className="profit-card-metric-value">{fmtAR(p.liqMambula)}</div>
              </div>
              <div>
                <div className="profit-card-metric-label">Gastos</div>
                <div className="profit-card-metric-value">− {fmtAR(p.gastos)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
