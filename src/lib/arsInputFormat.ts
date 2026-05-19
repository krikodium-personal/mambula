/** Formato argentino: miles con punto, decimales con coma. */

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

function formatIntegerDigits(digits: string): string {
  if (!digits) return ''
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Normaliza lo tipeado o pegado a dígitos + coma decimal opcional. */
export function normalizeArsDraftTyping(raw: string): string {
  const cleaned = raw.replace(/\s/g, '').replace(/\$/g, '')
  if (!cleaned) return ''

  const commaIdx = cleaned.indexOf(',')
  if (commaIdx >= 0) {
    const intDigits = digitsOnly(cleaned.slice(0, commaIdx))
    const decDigits = digitsOnly(cleaned.slice(commaIdx + 1)).slice(0, 2)
    if (cleaned.endsWith(',') && decDigits.length === 0) {
      return intDigits ? `${intDigits},` : ','
    }
    return decDigits.length > 0 ? `${intDigits},${decDigits}` : intDigits
  }

  return digitsOnly(cleaned.replace(/\./g, ''))
}

/** Formatea el valor del input mientras se escribe. */
export function formatArsDraftInput(raw: string): string {
  const normalized = normalizeArsDraftTyping(raw)
  if (!normalized) return ''

  const commaIdx = normalized.indexOf(',')
  if (commaIdx >= 0) {
    const intDigits = normalized.slice(0, commaIdx)
    const decPart = normalized.slice(commaIdx + 1)
    const formattedInt = formatIntegerDigits(intDigits)
    if (normalized.endsWith(',') && !decPart) {
      return formattedInt ? `${formattedInt},` : ','
    }
    return `${formattedInt},${decPart}`
  }

  return formatIntegerDigits(normalized)
}

export function formatArsDraftFromNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return ''

  const rounded = Math.round(value * 100) / 100
  if (Number.isInteger(rounded)) {
    return formatIntegerDigits(String(Math.trunc(rounded)))
  }

  const [intPart, dec] = rounded.toFixed(2).split('.')
  const decTrim = dec.replace(/0+$/, '')
  return `${formatIntegerDigits(intPart)},${decTrim}`
}

export function parseArsDraftAmount(raw: string): number {
  const trimmed = raw.trim()
  if (!trimmed) return 0

  const normalized = trimmed.replace(/\./g, '').replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : NaN
}

export function isArsDraftEmptyOrZero(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return true
  const n = parseArsDraftAmount(trimmed)
  return !Number.isFinite(n) || n === 0
}
