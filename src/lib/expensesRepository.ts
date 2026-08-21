import { supabase } from './supabase'
import type { SaleKind } from '../types'

export type ExpenseKind = SaleKind

export type Expense = {
  id: string
  year: number
  month: string
  concept: string
  pesos: number | null
  rate: number | null
  usd: number
  payer: string
  kind: ExpenseKind
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
  kind: ExpenseKind
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
  expense_kind?: string | null
  created_at: string
}

const LS_KEY = 'mambula_expenses_v1'
const EXPENSE_SELECT =
  'id, year, month, concept, pesos_ars, rate, usd, payer, expense_kind, created_at'

function normalizeExpenseKind(raw: string | null | undefined): ExpenseKind {
  return raw === 'shows' ? 'shows' : 'libros'
}

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
    kind: normalizeExpenseKind(row.expense_kind),
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
    expense_kind: input.kind,
  }
}

function readLocal(): Expense[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed.map((item) => {
      const row = item as Expense
      return {
        ...row,
        kind: normalizeExpenseKind(row.kind),
      }
    })
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
    .select(EXPENSE_SELECT)
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
      kind: normalizeExpenseKind(input.kind),
      createdAt: new Date().toISOString(),
    }
    writeLocal([row, ...readLocal()])
    return row
  }

  const { data, error } = await supabase
    .from('expenses')
    .insert(mapInputToRow(input))
    .select(EXPENSE_SELECT)
    .single()

  if (error) throw error

  return mapRow(data as ExpenseRow)
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<Expense> {
  if (!supabase) {
    const next = readLocal().map((row) =>
      row.id === id
        ? {
            ...row,
            ...input,
            kind: normalizeExpenseKind(input.kind),
          }
        : row,
    )
    writeLocal(next)
    const updated = next.find((row) => row.id === id)
    if (!updated) throw new Error('No se encontró el gasto.')
    return updated
  }

  const { data, error } = await supabase
    .from('expenses')
    .update(mapInputToRow(input))
    .eq('id', id)
    .select(EXPENSE_SELECT)
    .single()

  if (error) throw error

  return mapRow(data as ExpenseRow)
}
