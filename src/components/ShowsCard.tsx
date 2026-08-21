import { useState } from 'react'
import type { Expense } from '../lib/expensesRepository'
import type { Sale } from '../types'

const arsIntegerFormatter = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

const fmtAR = (n: number) => '$\u00A0' + arsIntegerFormatter.format(Math.round(n))

const fmtSigned = (n: number) => {
  const rounded = Math.round(n)
  return (rounded < 0 ? '-' : '') + '$\u00A0' + arsIntegerFormatter.format(Math.abs(rounded))
}

type ShowsListKind = 'ingresos' | 'egresos'

export type ShowsCardProps = {
  ingresosArs: number
  egresosArs: number
  incomeRows: Array<{ id: string; label: string; amountArs: number }>
  expenseRows: Array<{ id: string; label: string; amountArs: number; payer: string }>
}

export default function ShowsCard({
  ingresosArs,
  egresosArs,
  incomeRows,
  expenseRows,
}: ShowsCardProps) {
  const [listSheet, setListSheet] = useState<ShowsListKind | null>(null)
  const balanceArs = ingresosArs - egresosArs

  return (
    <>
      <div className="shows-card">
        <div className="shows-card-header">
          <div className="shows-card-eyebrow">Shows</div>
          <div className="shows-card-title">Ingresos y egresos</div>
          <p className="shows-card-lead">
            Movimientos marcados como <strong>Shows</strong> en ventas y gastos, separados del
            reparto de libros.
          </p>
        </div>

        <div className="shows-card-hero-wrap">
          <div className="shows-card-hero">
            <div>
              <div className="shows-card-hero-label">Balance</div>
              <div className={`shows-card-hero-total ${balanceArs < 0 ? 'is-negative' : ''}`}>
                {fmtSigned(balanceArs)}
              </div>
            </div>
            <div className="shows-card-hero-meta">
              {incomeRows.length} ingreso{incomeRows.length === 1 ? '' : 's'}
              <br />
              <span className="shows-card-hero-meta-sub">
                {expenseRows.length} egreso{expenseRows.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>

        <div className="shows-card-kpis">
          <button
            className="shows-card-kpi"
            onClick={() => setListSheet('ingresos')}
            type="button"
          >
            <span>Ingresos</span>
            <strong className="is-positive">{fmtAR(ingresosArs)}</strong>
          </button>
          <button
            className="shows-card-kpi"
            onClick={() => setListSheet('egresos')}
            type="button"
          >
            <span>Egresos</span>
            <strong className="is-negative">{fmtAR(egresosArs)}</strong>
          </button>
        </div>
      </div>

      {listSheet ? (
        <ShowsMovementsSheet
          expenseRows={expenseRows}
          incomeRows={incomeRows}
          kind={listSheet}
          onClose={() => setListSheet(null)}
          totalArs={listSheet === 'ingresos' ? ingresosArs : egresosArs}
        />
      ) : null}
    </>
  )
}

function ShowsMovementsSheet({
  expenseRows,
  incomeRows,
  kind,
  onClose,
  totalArs,
}: {
  expenseRows: ShowsCardProps['expenseRows']
  incomeRows: ShowsCardProps['incomeRows']
  kind: ShowsListKind
  onClose: () => void
  totalArs: number
}) {
  const isIngresos = kind === 'ingresos'
  const rows = isIngresos ? incomeRows : expenseRows
  const title = isIngresos ? 'Ingresos' : 'Egresos'
  const amountClass = isIngresos ? 'is-positive' : 'is-negative'
  const countLabel = isIngresos
    ? `${incomeRows.length} ingreso${incomeRows.length === 1 ? '' : 's'}`
    : `${expenseRows.length} egreso${expenseRows.length === 1 ? '' : 's'}`

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <h2>{title}</h2>
            <p>
              {countLabel} · Total {fmtAR(totalArs)}
            </p>
          </div>
          <button aria-label="Cerrar" className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="shows-sheet-body">
          {rows.length === 0 ? (
            <p className="shows-sheet-empty">
              {isIngresos
                ? 'Todavía no hay ingresos de shows.'
                : 'Todavía no hay egresos de shows.'}
            </p>
          ) : (
            <ul className="shows-sheet-list">
              {isIngresos
                ? incomeRows.map((row) => (
                    <li key={row.id}>
                      <span>{row.label}</span>
                      <strong className={amountClass}>{fmtAR(row.amountArs)}</strong>
                    </li>
                  ))
                : expenseRows.map((row) => (
                    <li key={row.id}>
                      <span>
                        {row.label}
                        <em>{row.payer}</em>
                      </span>
                      <strong className={amountClass}>{fmtAR(row.amountArs)}</strong>
                    </li>
                  ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/** Helpers reutilizables para armar filas del módulo Shows. */
export function showSaleLabel(sale: Pick<Sale, 'buyer'>): string {
  const name = sale.buyer.trim()
  return name || 'Sin nombre'
}

export function showExpenseLabel(expense: Pick<Expense, 'concept'>): string {
  const name = expense.concept.trim()
  return name || 'Sin concepto'
}
