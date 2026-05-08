import { mergePromoRowsFromRemotePayload, loadPromoRows, type PromoRowsStored } from './promocionalesStorage'
import { supabase } from './supabase'

export async function fetchPromoRowsFromSupabase(defaultRows: PromoRowsStored): Promise<PromoRowsStored> {
  if (!supabase) {
    return loadPromoRows(defaultRows)
  }

  const { data, error } = await supabase
    .from('project_settings')
    .select('promocional_rows')
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  const raw = data?.promocional_rows as unknown
  if (raw == null) {
    return loadPromoRows(defaultRows)
  }

  return mergePromoRowsFromRemotePayload(raw, defaultRows)
}

export async function savePromoRowsRemote(rows: PromoRowsStored): Promise<void> {
  if (!supabase) return

  const payload = JSON.parse(JSON.stringify(rows)) as PromoRowsStored

  const { data: row, error: readError } = await supabase
    .from('project_settings')
    .select('id')
    .limit(1)
    .maybeSingle()

  if (readError) {
    throw readError
  }
  if (!row?.id) {
    throw new Error('No hay configuración de proyecto en Supabase.')
  }

  const { error } = await supabase
    .from('project_settings')
    .update({ promocional_rows: payload })
    .eq('id', row.id)

  if (error) {
    throw error
  }
}
