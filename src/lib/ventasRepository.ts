import type { SupabaseClient } from '@supabase/supabase-js'
import { ABRAZANDOCUENTOS_REFERENCE_UNIT_PRICE_ARS } from '../data/partnerSplits'
import { projectConfig, sales, stockAllocations } from '../data/ventas'
import { supabase } from './supabase'
import type { AcSchemeSaleRecord, ProjectConfig, Sale, StockAllocation } from '../types'

const AC_SCHEME_SOLD_UNITS_LS_KEY = 'mambula_ac_scheme_sold_units'
const AC_SCHEME_SALES_LS_KEY = 'mambula_ac_scheme_sales_json'

type AcSchemeSaleRow = {
  id: string
  sold_at: string
  amount_ars: number
  quantity: number
  created_at: string
}

type ProjectSettingsRow = {
  project_name: string
  first_print_copies: number
  first_print_boxes: number
  abrazando_cuentos_share: number
  wonky_share: number
  book_cost_usd: number
  payment_provider: string
  payment_alias: string
  ac_scheme_sold_units: number | null
}

type StockAllocationRow = {
  name: string
  copies: number
  boxes: number
}

type SaleRow = {
  id: string
  sold_at: string
  buyer: string
  seller: string | null
  quantity: number | null
  unit_price_ars: number | null
  paid_ars: number
  payment_method?: string | null
  transfer_destination?: string | null
  payment_status: Sale['paymentStatus']
  invoice_status: NonNullable<Sale['invoiceStatus']>
  delivered: string | null
  billing_notes: string | null
  /** Orden de fila en Excel; null = alta manual (va al final). */
  sheet_position: number | null
}

export type SaleUpdateInput = Pick<
  Sale,
  | 'id'
  | 'buyer'
  | 'seller'
  | 'quantity'
  | 'unitPriceArs'
  | 'paidArs'
  | 'paymentMethod'
  | 'transferDestination'
  | 'paymentStatus'
  | 'invoiceStatus'
  | 'delivered'
  | 'billingNotes'
>

export type SaleCreateInput = Omit<SaleUpdateInput, 'id'>

export type VentasData = {
  projectConfig: ProjectConfig
  stockAllocations: StockAllocation[]
  sales: Sale[]
  /** @deprecated Filas nuevas en `acSchemeSales`; solo fallback si no hay registros en tabla. */
  acSchemeSoldUnits: number | null
  acSchemeSales: AcSchemeSaleRecord[]
}

function mapAcSchemeSale(row: AcSchemeSaleRow): AcSchemeSaleRecord {
  return {
    id: row.id,
    soldAt: row.sold_at,
    amountArs: Number(row.amount_ars),
    quantity: Number(row.quantity),
  }
}

/** Ejemplares vendidos en esquema AC: suma de registros, o contador legacy si la tabla está vacía. */
export function totalAcSchemeSoldQuantity(data: VentasData): number {
  const fromRecords = data.acSchemeSales.reduce((sum, row) => sum + row.quantity, 0)
  if (data.acSchemeSales.length > 0) {
    return fromRecords
  }

  if (data.acSchemeSoldUnits != null && Number.isFinite(data.acSchemeSoldUnits)) {
    return Math.max(0, Math.floor(Number(data.acSchemeSoldUnits)))
  }

  return 0
}

function readLocalAcSchemeSales(): AcSchemeSaleRecord[] {
  try {
    const raw = localStorage.getItem(AC_SCHEME_SALES_LS_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((item): AcSchemeSaleRecord | null => {
        if (!item || typeof item !== 'object') return null
        const o = item as Record<string, unknown>
        const id = typeof o.id === 'string' ? o.id : null
        const soldAt = typeof o.soldAt === 'string' ? o.soldAt : null
        const amountArs = typeof o.amountArs === 'number' ? o.amountArs : Number(o.amountArs)
        const quantity = typeof o.quantity === 'number' ? o.quantity : Number(o.quantity)
        if (!id || !soldAt || !Number.isFinite(amountArs) || !Number.isFinite(quantity)) return null

        return {
          id,
          soldAt,
          amountArs,
          quantity: Math.max(0, Math.floor(quantity)),
        }
      })
      .filter((row): row is AcSchemeSaleRecord => row !== null && row.quantity > 0)
  } catch {
    return []
  }
}

function writeLocalAcSchemeSales(rows: AcSchemeSaleRecord[]) {
  try {
    localStorage.setItem(AC_SCHEME_SALES_LS_KEY, JSON.stringify(rows))
  } catch {
    /* ignore */
  }
}

/** Migra el contador LS viejo a registros locales (una sola vez). */
function migrateLocalLegacyAcSchemeSales(): AcSchemeSaleRecord[] {
  const existing = readLocalAcSchemeSales()
  if (existing.length > 0) {
    return existing
  }

  const legacy = readLocalAcSchemeSoldUnits()
  if (legacy === null || legacy <= 0) {
    return []
  }

  const qty = Math.floor(legacy)
  const row: AcSchemeSaleRecord = {
    id: crypto.randomUUID(),
    soldAt: new Date().toISOString().slice(0, 10),
    amountArs: qty * ABRAZANDOCUENTOS_REFERENCE_UNIT_PRICE_ARS,
    quantity: qty,
  }

  writeLocalAcSchemeSales([row])

  try {
    localStorage.removeItem(AC_SCHEME_SOLD_UNITS_LS_KEY)
  } catch {
    /* ignore */
  }

  return [row]
}

async function fetchAcSchemeSalesRows(client: SupabaseClient): Promise<AcSchemeSaleRow[]> {
  const { data, error } = await client
    .from('ac_scheme_sales')
    .select('id, sold_at, amount_ars, quantity, created_at')
    .order('sold_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as AcSchemeSaleRow[]
}

export async function insertAcSchemeSaleRecord(input: {
  soldAt: string
  quantity: number
}): Promise<AcSchemeSaleRecord> {
  const qty = Math.max(1, Math.floor(Number(input.quantity)))
  const amountArs = qty * ABRAZANDOCUENTOS_REFERENCE_UNIT_PRICE_ARS
  const soldAt = input.soldAt.trim().slice(0, 10)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(soldAt)) {
    throw new Error('Fecha de venta inválida.')
  }

  if (!supabase) {
    const row: AcSchemeSaleRecord = {
      id: crypto.randomUUID(),
      soldAt,
      amountArs,
      quantity: qty,
    }

    writeLocalAcSchemeSales([row, ...readLocalAcSchemeSales()])

    return row
  }

  const { data, error } = await supabase
    .from('ac_scheme_sales')
    .insert({
      sold_at: soldAt,
      amount_ars: amountArs,
      quantity: qty,
    })
    .select('id, sold_at, amount_ars, quantity, created_at')
    .single()

  if (error) {
    throw error
  }

  return mapAcSchemeSale(data as AcSchemeSaleRow)
}

/** Mensaje legible para errores de Supabase/PostgREST (no siempre son `instanceof Error`). */
export function formatUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message: unknown }).message
    if (typeof msg === 'string' && msg.trim()) return msg.trim()
  }

  return 'No se pudo eliminar.'
}

export async function deleteAcSchemeSaleRecord(id: string): Promise<void> {
  const trimmed = id.trim()
  if (!trimmed) {
    throw new Error('Identificador inválido.')
  }

  if (!supabase) {
    const next = readLocalAcSchemeSales().filter((row) => row.id !== trimmed)
    writeLocalAcSchemeSales(next)
    return
  }

  const { data, error } = await supabase.from('ac_scheme_sales').delete().eq('id', trimmed).select('id')

  if (error) {
    throw new Error(formatUnknownError(error))
  }

  if (!data?.length) {
    throw new Error(
      'No se borró ninguna fila (¿el registro ya no existe?). Si usás Supabase, comprobá que esté aplicada la migración que permite DELETE en ac_scheme_sales.',
    )
  }
}

function readLocalAcSchemeSoldUnits(): number | null {
  try {
    const raw = localStorage.getItem(AC_SCHEME_SOLD_UNITS_LS_KEY)
    if (raw === null) {
      return null
    }
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}

export async function updateAcSchemeSoldUnits(units: number): Promise<void> {
  const clamped = Math.max(0, Math.floor(units))

  if (!supabase) {
    try {
      localStorage.setItem(AC_SCHEME_SOLD_UNITS_LS_KEY, String(clamped))
    } catch {
      /* ignore quota / private mode */
    }
    return
  }

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

  const { data: updated, error } = await supabase
    .from('project_settings')
    .update({ ac_scheme_sold_units: clamped })
    .eq('id', row.id)
    .select('ac_scheme_sold_units')
    .maybeSingle()

  if (error) {
    throw error
  }
  if (!updated) {
    throw new Error('No se actualizó ninguna fila en project_settings.')
  }
}

export async function updateStockAllocations(
  allocations: StockAllocation[],
): Promise<StockAllocation[]> {
  if (!supabase) {
    throw new Error('Supabase no está configurado.')
  }

  const client = supabase
  const updated = await Promise.all(
    allocations.map(async (allocation) => {
      const { data, error } = await client
        .from('stock_allocations')
        .update({
          copies: allocation.copies,
          boxes: allocation.boxes,
        })
        .eq('name', allocation.name)
        .select('name, copies, boxes')
        .single()

      if (error) {
        throw error
      }

      return mapStockAllocation(data as StockAllocationRow)
    }),
  )

  return updated
}

export async function createSale(input: SaleCreateInput): Promise<Sale> {
  if (!supabase) {
    throw new Error('Supabase no está configurado.')
  }

  const { data, error } = await supabase
    .from('sales')
    .insert({
      sold_at: new Date().toISOString().slice(0, 10),
      buyer: input.buyer,
      seller: input.seller,
      quantity: input.quantity,
      unit_price_ars: input.unitPriceArs,
      paid_ars: input.paidArs,
      payment_method: input.paymentMethod,
      transfer_destination:
        input.paymentMethod === 'transferencia' ? input.transferDestination : null,
      payment_status: input.paymentStatus,
      invoice_status: input.invoiceStatus ?? 'pendiente',
      delivered: input.delivered,
      billing_notes: input.billingNotes,
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapSale(data as SaleRow)
}

export async function deleteSale(id: string): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase no está configurado.')
  }

  const { error } = await supabase
    .from('sales')
    .delete()
    .eq('id', id)

  if (error) {
    throw error
  }
}

export async function updateInvoiceStatus(
  id: string,
  invoiceStatus: NonNullable<Sale['invoiceStatus']>,
): Promise<Sale> {
  if (!supabase) {
    throw new Error('Supabase no está configurado.')
  }

  const { data, error } = await supabase
    .from('sales')
    .update({ invoice_status: invoiceStatus })
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapSale(data as SaleRow)
}

export async function updateSale(input: SaleUpdateInput): Promise<Sale> {
  if (!supabase) {
    throw new Error('Supabase no está configurado.')
  }

  const { data, error } = await supabase
    .from('sales')
    .update({
      buyer: input.buyer,
      seller: input.seller,
      quantity: input.quantity,
      unit_price_ars: input.unitPriceArs,
      paid_ars: input.paidArs,
      payment_method: input.paymentMethod,
      transfer_destination:
        input.paymentMethod === 'transferencia' ? input.transferDestination : null,
      payment_status: input.paymentStatus,
      invoice_status: input.invoiceStatus ?? 'pendiente',
      delivered: input.delivered,
      billing_notes: input.billingNotes,
    })
    .eq('id', input.id)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapSale(data as SaleRow)
}

/** PostgREST suele limitar filas por respuesta; paginamos hasta traer todas las ventas. */
const SALES_FETCH_PAGE_SIZE = 1000

async function fetchAllSalesRows(client: SupabaseClient): Promise<SaleRow[]> {
  const rows: SaleRow[] = []
  let from = 0

  for (;;) {
    const { data, error } = await client
      .from('sales')
      .select('*')
      .order('sheet_position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .range(from, from + SALES_FETCH_PAGE_SIZE - 1)

    if (error) {
      throw error
    }

    const batch = (data ?? []) as SaleRow[]
    rows.push(...batch)

    if (batch.length < SALES_FETCH_PAGE_SIZE) {
      break
    }

    from += SALES_FETCH_PAGE_SIZE
  }

  return rows
}

export const fallbackVentasData: VentasData = {
  projectConfig,
  stockAllocations,
  sales,
  acSchemeSoldUnits: null,
  acSchemeSales: [],
}

export async function loadVentasData(): Promise<VentasData> {
  if (!supabase) {
    const acSchemeSales = migrateLocalLegacyAcSchemeSales()

    return {
      ...fallbackVentasData,
      acSchemeSoldUnits: null,
      acSchemeSales,
    }
  }

  const [settingsResponse, allocationsResponse, saleRows, acSchemeSalesRows] = await Promise.all([
    supabase.from('project_settings').select('*').limit(1).maybeSingle(),
    supabase.from('stock_allocations').select('name, copies, boxes').order('created_at'),
    fetchAllSalesRows(supabase),
    fetchAcSchemeSalesRows(supabase),
  ])

  if (settingsResponse.error) {
    throw settingsResponse.error
  }

  if (allocationsResponse.error) {
    throw allocationsResponse.error
  }

  const settings = settingsResponse.data as ProjectSettingsRow | null
  const rawAcUnits = settings?.ac_scheme_sold_units
  const acSchemeSoldUnits =
    rawAcUnits === null || rawAcUnits === undefined
      ? null
      : Number.isFinite(Number(rawAcUnits))
        ? Math.max(0, Math.floor(Number(rawAcUnits)))
        : null

  const acSchemeSales = acSchemeSalesRows.map((row) => mapAcSchemeSale(row))

  return {
    projectConfig: settings ? mapProjectConfig(settings) : projectConfig,
    stockAllocations: ((allocationsResponse.data ?? []) as StockAllocationRow[]).map(
      mapStockAllocation,
    ),
    sales: saleRows.map(mapSale),
    acSchemeSoldUnits,
    acSchemeSales,
  }
}

function mapProjectConfig(row: ProjectSettingsRow): ProjectConfig {
  return {
    projectName: row.project_name,
    sectionName: projectConfig.sectionName,
    firstPrintRun: {
      copies: row.first_print_copies,
      boxes: row.first_print_boxes,
    },
    costRules: {
      abrazandoCuentosShare: Number(row.abrazando_cuentos_share),
      wonkyShare: Number(row.wonky_share),
      bookCostUsd: Number(row.book_cost_usd),
    },
    payment: {
      provider: row.payment_provider,
      alias: row.payment_alias,
    },
  }
}

function mapStockAllocation(row: StockAllocationRow): StockAllocation {
  return {
    name: row.name,
    copies: row.copies,
    boxes: row.boxes,
  }
}

function normalizeInvoiceStatus(raw: string | null | undefined): NonNullable<Sale['invoiceStatus']> {
  if (raw === 'facturado' || raw === 'pendiente' || raw === 'no_aplica') {
    return raw
  }
  if (raw === 'no_facturado') {
    return 'pendiente'
  }
  return 'pendiente'
}

function normalizeTransferDestination(raw: string | null | undefined): Sale['transferDestination'] {
  if (raw === 'Delfi' || raw === 'Mechi') return raw

  return null
}

function normalizePaymentMethod(raw: string | null | undefined): Sale['paymentMethod'] {
  if (raw === 'transferencia' || raw === 'efectivo' || raw === 'otro') return raw

  return null
}

function mapSale(row: SaleRow): Sale {
  return {
    id: row.id,
    date: row.sold_at,
    buyer: row.buyer,
    seller: row.seller,
    quantity: row.quantity,
    unitPriceArs: row.unit_price_ars === null ? null : Number(row.unit_price_ars),
    paidArs: Number(row.paid_ars),
    paymentMethod: normalizePaymentMethod(row.payment_method),
    transferDestination: normalizeTransferDestination(row.transfer_destination),
    paymentStatus: row.payment_status,
    invoiceStatus: normalizeInvoiceStatus(row.invoice_status),
    delivered: row.delivered,
    billingNotes: row.billing_notes,
  }
}
