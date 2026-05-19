import { useEffect, useMemo, useState } from 'react'
import type { CuentasMedioBalances } from '../lib/cuentasMedioBalances'
import {
  listCuentasSourcesCoveringAmount,
  type CuentasPaymentSource,
} from '../lib/cuentasPaymentSources'

type WonkyEjemplaresSettlementModalProps = {
  arsPerEjemplar: number
  cuentasBalances: CuentasMedioBalances
  ejemplaresPendientes: number
  ejemplaresVendidos: number
  formatArs: (value: number) => string
  onClose: () => void
  onSubmit: (input: {
    copies: number
    settledOn: string
    amountArs: number
    source: CuentasPaymentSource
  }) => Promise<void>
}

function parseCopiesInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null
  return n
}

export default function WonkyEjemplaresSettlementModal({
  arsPerEjemplar,
  cuentasBalances,
  ejemplaresPendientes,
  ejemplaresVendidos,
  formatArs,
  onClose,
  onSubmit,
}: WonkyEjemplaresSettlementModalProps) {
  const [copiesDraft, setCopiesDraft] = useState('')
  const [settledOn, setSettledOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const copies = parseCopiesInput(copiesDraft)
  const previewArs = copies !== null ? copies * arsPerEjemplar : null

  const sourceOptions = useMemo(
    () => (previewArs !== null ? listCuentasSourcesCoveringAmount(cuentasBalances, previewArs) : []),
    [cuentasBalances, previewArs],
  )

  useEffect(() => {
    if (sourceOptions.length === 0) {
      setSelectedSourceId(null)
      return
    }
    setSelectedSourceId((current) =>
      current && sourceOptions.some((o) => o.id === current) ? current : sourceOptions[0]!.id,
    )
  }, [sourceOptions])

  const selectedSource = sourceOptions.find((o) => o.id === selectedSourceId)?.source ?? null

  const canSubmit = useMemo(() => {
    if (copies === null || copies <= 0) return false
    if (copies > ejemplaresPendientes) return false
    if (!settledOn) return false
    if (previewArs === null || previewArs <= 0) return false
    if (sourceOptions.length === 0) return false
    if (!selectedSource) return false
    return true
  }, [copies, ejemplaresPendientes, settledOn, previewArs, sourceOptions.length, selectedSource])

  async function handleSubmit() {
    if (copies === null || copies <= 0) {
      setError('Ingresá una cantidad válida de ejemplares.')
      return
    }
    if (copies > ejemplaresPendientes) {
      setError(`No podés saldar más de ${ejemplaresPendientes} ejemplares pendientes.`)
      return
    }
    if (!settledOn) {
      setError('Elegí una fecha.')
      return
    }
    if (!selectedSource || previewArs === null) {
      setError('Elegí de qué cuenta sale el pago.')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      await onSubmit({
        copies,
        settledOn,
        amountArs: previewArs,
        source: selectedSource,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el saldo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <h2>Saldar cuenta · Wonky</h2>
            <p>Ejemplares vendidos (cobrado o parcial): {ejemplaresVendidos}</p>
          </div>
          <button aria-label="Cerrar" className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="new-sale-form">
          <p className="card-note">
            Pendiente de saldar: <strong>{ejemplaresPendientes}</strong> ejemplares (
            {formatArs(ejemplaresPendientes * arsPerEjemplar)}).
          </p>

          <div className="new-sale-field">
            <span className="new-sale-field-label">Ejemplares a saldar</span>
            <input
              inputMode="numeric"
              placeholder="0"
              value={copiesDraft}
              onChange={(e) => setCopiesDraft(e.target.value.replace(/[^\d]/g, ''))}
            />
          </div>

          {previewArs !== null && copies !== null ? (
            <div className="wonky-settle-preview">
              <div className="sheet-list-item">
                <span>
                  {copies} ejemplares × {formatArs(arsPerEjemplar)}
                </span>
                <strong>{formatArs(previewArs)}</strong>
              </div>
            </div>
          ) : null}

          {previewArs !== null && previewArs > 0 ? (
            <div className="new-sale-field">
              <span className="new-sale-field-label">Pagar desde</span>
              {sourceOptions.length === 0 ? (
                <p className="edit-error">
                  Ninguna cuenta de efectivo o transferencia tiene saldo suficiente para cubrir{' '}
                  {formatArs(previewArs)}.
                </p>
              ) : (
                <ul className="wonky-settle-source-list">
                  {sourceOptions.map((option) => (
                    <li key={option.id}>
                      <label className="wonky-settle-source-option">
                        <input
                          checked={selectedSourceId === option.id}
                          name="wonky-payment-source"
                          type="radio"
                          value={option.id}
                          onChange={() => setSelectedSourceId(option.id)}
                        />
                        <span className="wonky-settle-source-option-body">
                          <span className="wonky-settle-source-option-label">{option.label}</span>
                          <span className="wonky-settle-source-option-meta">
                            Disponible {formatArs(option.availableArs)}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div className="new-sale-field">
            <span className="new-sale-field-label">Fecha de operación</span>
            <input type="date" value={settledOn} onChange={(e) => setSettledOn(e.target.value)} />
          </div>

          {error ? <p className="edit-error">{error}</p> : null}

          <div className="edit-actions">
            <button className="secondary-button" disabled={submitting} onClick={onClose} type="button">
              Cancelar
            </button>
            <button
              className="primary-button"
              disabled={submitting || !canSubmit}
              onClick={() => void handleSubmit()}
              type="button"
            >
              {submitting ? 'Guardando…' : 'Confirmar y aplicar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
