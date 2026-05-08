export type PromoDeliveredByStored = 'Delfi' | 'Mechi' | 'Susan'

export type PromoRowStored = {
  nombre: string
  unidades: number
  entregado: boolean
  entregadoPor: PromoDeliveredByStored | null
}

export type PromoRowsStored = {
  equipo: PromoRowStored[]
  colaboracion: PromoRowStored[]
  influencers: PromoRowStored[]
  colegio: PromoRowStored[]
}

const STORAGE_KEY = 'mambula_promocionales_v1'

const GROUP_KEYS = ['equipo', 'colaboracion', 'influencers', 'colegio'] as const satisfies ReadonlyArray<keyof PromoRowsStored>

function normalizeEntregadoPor(value: unknown): PromoDeliveredByStored | null {
  if (value === 'Delfi' || value === 'Mechi' || value === 'Susan') {
    return value
  }

  return null
}

function normalizeRow(raw: unknown): PromoRowStored | null {
  if (!raw || typeof raw !== 'object') return null

  const row = raw as Record<string, unknown>
  if (typeof row.nombre !== 'string' || row.nombre.trim() === '') return null

  const u = typeof row.unidades === 'number' ? row.unidades : Number(row.unidades)
  if (!Number.isFinite(u) || u < 0) return null

  return {
    nombre: row.nombre.trim(),
    unidades: Math.floor(u),
    entregado: Boolean(row.entregado),
    entregadoPor: normalizeEntregadoPor(row.entregadoPor),
  }
}

function normalizeGroup(raw: unknown): PromoRowStored[] | null {
  if (!Array.isArray(raw)) return null

  const rows = raw.map(normalizeRow).filter((item): item is PromoRowStored => item !== null)

  return rows
}

/** Combina JSON remoto o de localStorage con los valores por defecto de la app (misma regla que antes). */
export function mergePromoRowsFromRemotePayload(parsed: unknown, defaultRows: PromoRowsStored): PromoRowsStored {
  if (!parsed || typeof parsed !== 'object') return defaultRows

  const blob = parsed as Record<string, unknown>
  const next: PromoRowsStored = { ...defaultRows }

  for (const key of GROUP_KEYS) {
    const normalized = normalizeGroup(blob[key])
    if (normalized !== null && normalized.length > 0) {
      next[key] = normalized
    }
  }

  return next
}

export function loadPromoRows(defaultRows: PromoRowsStored): PromoRowsStored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultRows

    const parsed: unknown = JSON.parse(raw)
    return mergePromoRowsFromRemotePayload(parsed, defaultRows)
  } catch {
    return defaultRows
  }
}

export function savePromoRows(rows: PromoRowsStored): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch {
    // ignore quota / private mode
  }
}
