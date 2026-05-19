import { useMemo, useState } from 'react'
import ArsAmountInput from './ArsAmountInput'
import {
  CUENTAS_SOCIAS,
  type CuentasMedioBalances,
  type CuentasSocia,
} from '../lib/cuentasMedioBalances'
import {
  computeCuentasSettlement,
  parseRequestedAmounts,
  type CuentasSettlementComputeResult,
  type CuentasSettlementDecisions,
  type CuentasSettlementQuestion,
} from '../lib/cuentasSettlementEngine'

type Step = 'input' | 'question' | 'confirm'

type CuentasMedioSettlementModalProps = {
  balances: CuentasMedioBalances
  formatArs: (value: number) => string
  onClose: () => void
  onConfirm: (result: CuentasSettlementComputeResult, settledOn: string) => Promise<void>
}

function emptyDraft(): Record<CuentasSocia, string> {
  return { Delfi: '', Mechi: '', Susan: '' }
}

function questionPrompt(q: CuentasSettlementQuestion): string {
  if (q.kind === 'own_bank_shortfall') {
    return `Los fondos de ${q.partner} no alcanzan para cubrir el monto completo. ¿Querés cubrir la diferencia con dinero de otra cuenta?`
  }

  return `Los fondos disponibles no alcanzan para cubrir el monto completo de ${q.partner}. ¿Querés saldar solo lo que hay disponible?`
}

export default function CuentasMedioSettlementModal({
  balances,
  formatArs,
  onClose,
  onConfirm,
}: CuentasMedioSettlementModalProps) {
  const [step, setStep] = useState<Step>('input')
  const [draft, setDraft] = useState(emptyDraft)
  const [settledOn, setSettledOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [decisions, setDecisions] = useState<CuentasSettlementDecisions>({
    ownBankShortfall: {},
    poolShortfall: {},
  })
  const [pendingQuestion, setPendingQuestion] = useState<CuentasSettlementQuestion | null>(null)
  const [result, setResult] = useState<CuentasSettlementComputeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const availableHint = useMemo(
    () =>
      CUENTAS_SOCIAS.map((p) => ({
        partner: p,
        efectivo: balances.efectivo[p],
        banco: p === 'Susan' ? null : balances.banco[p as 'Delfi' | 'Mechi'],
      })),
    [balances],
  )

  function runCalculate(nextDecisions: CuentasSettlementDecisions) {
    setError(null)
    const requested = parseRequestedAmounts(draft)
    const computed = computeCuentasSettlement(requested, balances, nextDecisions)

    if (computed.questions.length > 0) {
      setPendingQuestion(computed.questions[0]!)
      setStep('question')
      return
    }

    const hasAny = computed.lines.some((l) => l.settledArs > 0)
    if (!hasAny && Object.values(requested).every((v) => v <= 0)) {
      setError('Ingresá al menos un monto mayor a cero.')
      return
    }

    if (!hasAny) {
      setError('No hay fondos suficientes para saldar con los montos indicados.')
      return
    }

    setResult(computed)
    setStep('confirm')
  }

  function handleCalculate() {
    setDecisions({ ownBankShortfall: {}, poolShortfall: {} })
    runCalculate({ ownBankShortfall: {}, poolShortfall: {} })
  }

  function answerQuestion(answer: 'yes' | 'no') {
    if (!pendingQuestion) return

    const next: CuentasSettlementDecisions = {
      ownBankShortfall: { ...decisions.ownBankShortfall },
      poolShortfall: { ...decisions.poolShortfall },
    }

    if (pendingQuestion.kind === 'own_bank_shortfall') {
      next.ownBankShortfall[pendingQuestion.partner] = answer === 'yes' ? 'use_pool' : 'partial_only'
    } else {
      next.poolShortfall[pendingQuestion.partner] = answer === 'yes' ? 'settle_available' : 'skip'
    }

    setDecisions(next)
    setPendingQuestion(null)
    setStep('input')
    runCalculate(next)
  }

  function handleBack() {
    setStep('input')
    setResult(null)
    setPendingQuestion(null)
    setError(null)
  }

  async function handleConfirm() {
    if (!result) return
    if (!settledOn) {
      setError('Elegí una fecha.')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      await onConfirm(result, settledOn)
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
            <h2>
              {step === 'confirm'
                ? 'Confirmar saldo'
                : step === 'question'
                  ? 'Confirmación'
                  : '¿Cuánto querés saldar?'}
            </h2>
          </div>
          <button aria-label="Cerrar" className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="new-sale-form">
          {step === 'input' ? (
            <>
              <p className="card-note">
                Monto en ARS por socia. Dejá en blanco o $0 si no saldás a esa persona en esta operación.
              </p>
              {CUENTAS_SOCIAS.map((partner) => (
                <div className="new-sale-field" key={partner}>
                  <span className="new-sale-field-label">{partner}</span>
                  <ArsAmountInput
                    value={draft[partner]}
                    onChange={(value) => setDraft({ ...draft, [partner]: value })}
                  />
                  <span className="cuentas-settle-available-hint">
                    Disponible: efectivo {formatArs(availableHint.find((h) => h.partner === partner)!.efectivo)}
                    {partner !== 'Susan'
                      ? ` · cuenta ${formatArs(availableHint.find((h) => h.partner === partner)!.banco ?? 0)}`
                      : ''}
                  </span>
                </div>
              ))}
              <div className="new-sale-field">
                <span className="new-sale-field-label">Fecha de operación</span>
                <input type="date" value={settledOn} onChange={(e) => setSettledOn(e.target.value)} />
              </div>
            </>
          ) : null}

          {step === 'question' && pendingQuestion ? (
            <div className="cuentas-settle-question-block">
              <p className="card-note">{questionPrompt(pendingQuestion)}</p>
              <p className="cuentas-settle-question-meta">
                Máximo sin otra cuenta: {formatArs(pendingQuestion.maxSettleArs)}
              </p>
              <div className="edit-actions">
                <button className="secondary-button" onClick={() => answerQuestion('no')} type="button">
                  No
                </button>
                <button className="primary-button" onClick={() => answerQuestion('yes')} type="button">
                  Sí
                </button>
              </div>
            </div>
          ) : null}

          {step === 'confirm' && result ? (
            <div className="cuentas-settle-summary">
              {result.lines.map((line) => (
                <div className="cuentas-settle-partner-block" key={line.partner}>
                  <h4>{line.partner}</h4>
                  <div className="sheet-list-item">
                    <span>Saldado</span>
                    <strong>{formatArs(line.settledArs)}</strong>
                  </div>
                  {line.fromEfectivoArs > 0 ? (
                    <div className="sheet-list-item">
                      <span>De efectivo</span>
                      <strong>{formatArs(line.fromEfectivoArs)}</strong>
                    </div>
                  ) : null}
                  {line.fromOwnBankArs > 0 ? (
                    <div className="sheet-list-item">
                      <span>De cuenta propia</span>
                      <strong>{formatArs(line.fromOwnBankArs)}</strong>
                    </div>
                  ) : null}
                  {line.fromPool.map((d) => (
                    <div className="sheet-list-item" key={`${line.partner}-${d.account}`}>
                      <span>De cuenta {d.account}</span>
                      <strong>{formatArs(d.amountArs)}</strong>
                    </div>
                  ))}
                </div>
              ))}

              <h4 className="cuentas-settle-finals-title">Saldos finales</h4>
              <p className="cuentas-settle-finals-sub">Efectivo</p>
              {CUENTAS_SOCIAS.map((p) => (
                <div className="sheet-list-item" key={`ef-${p}`}>
                  <span>{p}</span>
                  <strong>{formatArs(result.balancesAfter.efectivo[p])}</strong>
                </div>
              ))}
              <p className="cuentas-settle-finals-sub">Cuentas bancarias</p>
              <div className="sheet-list-item">
                <span>Delfi</span>
                <strong>{formatArs(result.balancesAfter.banco.Delfi)}</strong>
              </div>
              <div className="sheet-list-item">
                <span>Mechi</span>
                <strong>{formatArs(result.balancesAfter.banco.Mechi)}</strong>
              </div>
            </div>
          ) : null}

          {error ? <p className="edit-error">{error}</p> : null}

          {step === 'input' ? (
            <div className="edit-actions">
              <button className="secondary-button" disabled={submitting} onClick={onClose} type="button">
                Cancelar
              </button>
              <button className="primary-button" disabled={submitting} onClick={handleCalculate} type="button">
                Calcular
              </button>
            </div>
          ) : null}

          {step === 'confirm' ? (
            <div className="edit-actions">
              <button className="secondary-button" disabled={submitting} onClick={handleBack} type="button">
                Volver
              </button>
              <button
                className="primary-button"
                disabled={submitting}
                onClick={() => void handleConfirm()}
                type="button"
              >
                {submitting ? 'Guardando…' : 'Confirmar y aplicar'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
