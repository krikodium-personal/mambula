import { projectConfig, sales, stockAllocations } from '../data/ventas'
import { supabase } from './supabase'
import type { ProjectConfig, Sale, StockAllocation } from '../types'

type ProjectSettingsRow = {
  project_name: string
  first_print_copies: number
  first_print_boxes: number
  abrazando_cuentos_share: number
  wonky_share: number
  book_cost_usd: number
  payment_provider: string
  payment_alias: string
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
  payment_method: Sale['paymentMethod']
  payment_status: Sale['paymentStatus']
  invoice_status: NonNullable<Sale['invoiceStatus']>
  delivered: string | null
  billing_notes: string | null
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
      payment_status: input.paymentStatus,
      invoice_status: input.invoiceStatus ?? 'no_aplica',
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
      payment_status: input.paymentStatus,
      invoice_status: input.invoiceStatus ?? 'no_aplica',
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

export const fallbackVentasData: VentasData = {
  projectConfig,
  stockAllocations,
  sales,
}

export async function loadVentasData(): Promise<VentasData> {
  if (!supabase) {
    return fallbackVentasData
  }

  const [settingsResponse, allocationsResponse, salesResponse] = await Promise.all([
    supabase.from('project_settings').select('*').limit(1).maybeSingle(),
    supabase.from('stock_allocations').select('name, copies, boxes').order('created_at'),
    supabase.from('sales').select('*').order('sold_at', { ascending: false }),
  ])

  if (settingsResponse.error) {
    throw settingsResponse.error
  }

  if (allocationsResponse.error) {
    throw allocationsResponse.error
  }

  if (salesResponse.error) {
    throw salesResponse.error
  }

  const settings = settingsResponse.data as ProjectSettingsRow | null

  return {
    projectConfig: settings ? mapProjectConfig(settings) : projectConfig,
    stockAllocations: ((allocationsResponse.data ?? []) as StockAllocationRow[]).map(
      mapStockAllocation,
    ),
    sales: ((salesResponse.data ?? []) as SaleRow[]).map(mapSale),
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

function mapSale(row: SaleRow): Sale {
  return {
    id: row.id,
    date: row.sold_at,
    buyer: row.buyer,
    seller: row.seller,
    quantity: row.quantity,
    unitPriceArs: row.unit_price_ars === null ? null : Number(row.unit_price_ars),
    paidArs: Number(row.paid_ars),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    invoiceStatus: row.invoice_status ?? 'no_aplica',
    delivered: row.delivered,
    billingNotes: row.billing_notes,
  }
}
