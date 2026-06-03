import { supabase } from './supabase'

export type Expense = {
  id: string
  year: number
  month: string
  concept: string
  pesos: number | null
  rate: number | null
  usd: number
  payer: string
  createdAt: string
}

export type ExpenseInput = {
  year: number
  month: string
  concept: string
  pesos: number | null
  rate: number | null
  usd: number
  payer: string
}

type ExpenseRow = {
  id: string
  year: number
  month: string
  concept: string
  pesos_ars: number | null
  rate: number | null
  usd: number
  payer: string
  created_at: string
}

const LS_KEY = 'mambula_expenses_v1'

function mapRow(row: ExpenseRow): Expense {
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    concept: row.concept,
    pesos: row.pesos_ars == null ? null : Number(row.pesos_ars),
    rate: row.rate == null ? null : Number(row.rate),
    usd: Number(row.usd),
    payer: row.payer,
    createdAt: row.created_at,
  }
}

function mapInputToRow(input: ExpenseInput) {
  return {
    year: input.year,
    month: input.month,
    concept: input.concept,
    pesos_ars: input.pesos,
    rate: input.rate,
    usd: input.usd,
    payer: input.payer,
  }
}

function readLocal(): Expense[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Expense[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocal(rows: Expense[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows))
}

export async function loadExpenses(): Promise<Expense[]> {
  if (!supabase) {
    return readLocal()
  }

  const { data, error } = await supabase
    .from('expenses')
    .select('id, year, month, concept, pesos_ars, rate, usd, payer, created_at')
    .order('year', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as ExpenseRow[]).map(mapRow)
}

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  if (!supabase) {
    const row: Expense = {
      id: crypto.randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    }
    writeLocal([row, ...readLocal()])
    return row
  }

  const { data, error } = await supabase
    .from('expenses')
    .insert(mapInputToRow(input))
    .select('id, year, month, concept, pesos_ars, rate, usd, payer, created_at')
    .single()

  if (error) throw error

  return mapRow(data as ExpenseRow)
}
