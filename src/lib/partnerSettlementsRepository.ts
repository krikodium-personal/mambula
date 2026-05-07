import type { PartnerSettlement, SplitPartnerKey } from '../types'
import { supabase } from './supabase'

const STORAGE_KEY = 'mambula_partner_settlements_v1'

type SettlementRow = {
  id: string
  partner: string
  amount_ars: number
  settled_on: string
  created_at: string
}

function mapRow(row: SettlementRow): PartnerSettlement {
  return {
    id: row.id,
    partner: row.partner as SplitPartnerKey,
    amountArs: Number(row.amount_ars),
    settledOn: row.settled_on,
    createdAt: row.created_at,
  }
}

function readLocal(): PartnerSettlement[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PartnerSettlement[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocal(rows: PartnerSettlement[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

export async function loadPartnerSettlements(): Promise<PartnerSettlement[]> {
  if (!supabase) {
    return readLocal()
  }

  const { data, error } = await supabase
    .from('partner_settlements')
    .select('id, partner, amount_ars, settled_on, created_at')
    .order('settled_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return ((data ?? []) as SettlementRow[]).map(mapRow)
}

export type PartnerSettlementInput = {
  partner: SplitPartnerKey
  amountArs: number
  settledOn: string
}

export async function createPartnerSettlement(input: PartnerSettlementInput): Promise<PartnerSettlement> {
  if (!supabase) {
    const row: PartnerSettlement = {
      id: crypto.randomUUID(),
      partner: input.partner,
      amountArs: input.amountArs,
      settledOn: input.settledOn,
      createdAt: new Date().toISOString(),
    }
    const next = [row, ...readLocal()]
    writeLocal(next)
    return row
  }

  const { data, error } = await supabase
    .from('partner_settlements')
    .insert({
      partner: input.partner,
      amount_ars: input.amountArs,
      settled_on: input.settledOn,
    })
    .select('id, partner, amount_ars, settled_on, created_at')
    .single()

  if (error) {
    throw error
  }

  return mapRow(data as SettlementRow)
}
