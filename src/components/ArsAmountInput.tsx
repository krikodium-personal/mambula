import { useState } from 'react'
import {
  formatArsDraftFromNumber,
  formatArsDraftInput,
  isArsDraftEmptyOrZero,
  parseArsDraftAmount,
} from '../lib/arsInputFormat'

type ArsAmountInputProps = {
  onChange: (value: string) => void
  value: string
  className?: string
}

export default function ArsAmountInput({ className, onChange, value }: ArsAmountInputProps) {
  const [focused, setFocused] = useState(false)

  function handleFocus() {
    setFocused(true)
    if (isArsDraftEmptyOrZero(value)) {
      onChange('')
    }
  }

  function handleBlur() {
    setFocused(false)
    const trimmed = value.trim()
    if (!trimmed) {
      onChange('')
      return
    }

    const amount = parseArsDraftAmount(trimmed)
    if (!Number.isFinite(amount) || amount <= 0) {
      onChange('')
      return
    }

    onChange(formatArsDraftFromNumber(amount))
  }

  return (
    <input
      className={className}
      inputMode="decimal"
      placeholder={focused ? '' : '0'}
      type="text"
      value={value}
      onBlur={handleBlur}
      onChange={(event) => onChange(formatArsDraftInput(event.target.value))}
      onFocus={handleFocus}
    />
  )
}
