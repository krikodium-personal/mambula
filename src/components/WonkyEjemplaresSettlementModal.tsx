import { useMemo, useState } from 'react'
import type { CuentasMedioBalances } from '../lib/cuentasMedioBalances'
import {
  allocateAcrossSources,
  defaultSourceSelectionForAmount,
  listCuentasSourcesWithFunds,
  type CuentasPaymentAllocation,
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
    sources: CuentasPaymentAllocation[]
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
  /** `null` = todavía no eligió a mano, se usa la selección automática. */
  const [pickedIds, setPickedIds] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const copies = parseCopiesInput(copiesDraft)
  const previewArs = copies !== null ? copies * arsPerEjemplar : null

  const sourceOptions = useMemo(() => listCuentasSourcesWithFunds(cuentasBalances), [cuentasBalances])

  const selectedIds = useMemo(
    () =>
      pickedIds ??
      (previewArs !== null && previewArs > 0
        ? defaultSourceSelectionForAmount(cuentasBalances, previewArs)
        : []),
    [cuentasBalances, pickedIds, previewArs],
  )

  const { allocations, remainingArs } = useMemo(() => {
    if (previewArs === null || previewArs <= 0) {
      return { allocations: [] as CuentasPaymentAllocation[], remainingArs: 0 }
    }
    return allocateAcrossSources(cuentasBalances, selectedIds, previewArs)
  }, [cuentasBalances, selectedIds, previewArs])

  const allocatedByOptionId = useMemo(() => {
    const map = new Map<string, number>()
    allocations.forEach((allocation) => {
      const id =
        allocation.source.kind === 'efectivo'
          ? `efectivo:${allocation.source.socia}`
          : `transferencia:${allocation.source.account}`
      map.set(id, allocation.amountArs)
    })
    return map
  }, [allocations])

  const totalDisponibleArs = sourceOptions.reduce((sum, option) => sum + option.availableArs, 0)
  const alcanzaEnTotal = previewArs !== null && totalDisponibleArs >= previewArs

  function toggleSource(id: string) {
    setPickedIds((current) => {
      const base = current ?? selectedIds
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
    })
  }

  const canSubmit = useMemo(() => {
    if (copies === null || copies <= 0) return false
    if (copies > ejemplaresPendientes) return false
    if (!settledOn) return false
    if (previewArs === null || previewArs <= 0) return false
    if (allocations.length === 0) return false
    if (remainingArs > 0) return false
    return true
  }, [copies, ejemplaresPendientes, settledOn, previewArs, allocations.length, remainingArs])

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
    if (previewArs === null || allocations.length === 0) {
      setError('Elegí de qué cuentas sale el pago.')
      return
    }
    if (remainingArs > 0) {
      setError(`Faltan ${formatArs(remainingArs)} para cubrir el pago. Sumá otra cuenta.`)
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      await onSubmit({
        copies,
        settledOn,
        amountArs: previewArs,
        sources: allocations,
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
              onChange={(e) => {
                setCopiesDraft(e.target.value.replace(/[^\d]/g, ''))
                setPickedIds(null)
              }}
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
                <p className="edit-error">Ninguna cuenta tiene saldo disponible.</p>
              ) : (
                <>
                  <p className="cuentas-settle-available-hint">
                    Podés combinar varias cuentas. Se descuenta primero de las de menor saldo.
                  </p>
                  <ul className="wonky-settle-source-list">
                    {sourceOptions.map((option) => {
                      const checked = selectedIds.includes(option.id)
                      const aportaArs = allocatedByOptionId.get(option.id) ?? 0

                      return (
                        <li key={option.id}>
                          <label className="wonky-settle-source-option">
                            <input
                              checked={checked}
                              type="checkbox"
                              onChange={() => toggleSource(option.id)}
                            />
                            <span className="wonky-settle-source-option-body">
                              <span className="wonky-settle-source-option-label">{option.label}</span>
                              <span className="wonky-settle-source-option-meta">
                                Disponible {formatArs(option.availableArs)}
                                {aportaArs > 0 ? ` · aporta ${formatArs(aportaArs)}` : ''}
                              </span>
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                  {remainingArs > 0 ? (
                    <p className="edit-error">
                      {alcanzaEnTotal
                        ? `Faltan ${formatArs(remainingArs)}. Sumá otra cuenta.`
                        : `Faltan ${formatArs(remainingArs)}. Entre todas las cuentas hay ${formatArs(totalDisponibleArs)}, no alcanza para cubrir el pago.`}
                    </p>
                  ) : null}
                </>
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
