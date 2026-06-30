const dateArFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const dateTimeArFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** Parsea ISO completo o fecha `YYYY-MM-DD` sin corrimiento de zona horaria. */
export function parseAppDate(value: string | Date): Date {
  if (value instanceof Date) return value

  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T12:00:00`)
  }

  return new Date(trimmed)
}

/** Fecha en formato DD/MM/AAAA. */
export function formatDateAr(value: string | Date): string {
  return dateArFormatter.format(parseAppDate(value))
}

/** Fecha y hora en formato DD/MM/AAAA, HH:mm. */
export function formatDateTimeAr(value: string | Date): string {
  return dateTimeArFormatter.format(parseAppDate(value))
}
