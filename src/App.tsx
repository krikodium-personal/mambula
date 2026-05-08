import './App.css'
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  computeAbrazandoGananciasFromUnits,
  computeAbrInventorySplit,
  computeVentasMambulaSplits,
  estimateArsPerUsdFromExpenseRates,
  settlementsTotalForPartner,
  AC_STOCK_NAME,
  WONKY_ARS_PER_VENTA_COPY,
  type AbrInventorySplit,
  type AbrazandoGananciasPreview,
} from './data/partnerSplits'
import { calculateSaleBreakdown } from './data/ventas'
import LiquidacionesVentasCard from './components/LiquidacionesVentasCard'
import ProfitCard from './components/ProfitCard'
import {
  breakdownInventoryMovement,
  promoDeliveredUnitsForStockRow,
  soldUnitsAttributedToSeller,
  type InventoryMovementBreakdown,
} from './lib/inventoryProgress'
import { loadPromoRows, savePromoRows, type PromoRowStored, type PromoRowsStored } from './lib/promocionalesStorage'
import { isSupabaseConfigured } from './lib/supabase'
import { createPartnerSettlement, loadPartnerSettlements } from './lib/partnerSettlementsRepository'
import {
  createSale,
  deleteSale,
  fallbackVentasData,
  loadVentasData,
  updateInvoiceStatus,
  updateAcSchemeSoldUnits,
  updateStockAllocations,
  updateSale,
  type SaleCreateInput,
  type SaleUpdateInput,
  type VentasData,
} from './lib/ventasRepository'
import type { PartnerGainBreakdown, PartnerSettlement, Sale, SplitPartnerKey, StockAllocation } from './types'

type AppTab = 'home' | 'ventas' | 'encargos' | 'promo' | 'gastos'
type SaleDraft = {
  buyer: string
  seller: string
  quantity: string
  unitPriceArs: string
  paidArs: string
  paymentMethod: Sale['paymentMethod']
  paymentStatus: Sale['paymentStatus']
  invoiceStatus: NonNullable<Sale['invoiceStatus']>
  delivered: string
  billingNotes: string
}
type StockAllocationDraft = Record<string, { copies: string; boxes: string }>

/** Filas de `stock_allocations` que no se muestran en el inventario del Home (se gestionan aparte). */
const HOME_INVENTORY_EXCLUDED_NAMES = new Set(['Promocionales'])

function allocationsForHomeInventoryTable(allocations: StockAllocation[]): StockAllocation[] {
  return allocations.filter((item) => !HOME_INVENTORY_EXCLUDED_NAMES.has(item.name))
}

type PromoGroup = keyof typeof promoData
type PromoDeliveredBy = 'Delfi' | 'Mechi' | 'Susan'

const PROMO_DELIVER_OPTIONS: Array<{ key: PromoDeliveredBy; label: string }> = [
  { key: 'Delfi', label: 'Delfi' },
  { key: 'Mechi', label: 'Mechi' },
  { key: 'Susan', label: 'Susan' },
]

const PROMO_ENTREGADO_SI_NO_OPTIONS: Array<{ key: 'SI' | 'NO'; label: string }> = [
  { key: 'SI', label: 'Sí' },
  { key: 'NO', label: 'No' },
]

type PromoDraft = {
  nombre: string
  unidades: string
  group: PromoGroup
  entregado: 'SI' | 'NO'
  entregadoPor: PromoDeliveredBy
}

type PromoEditDraft = {
  nombre: string
  unidades: string
  entregado: 'SI' | 'NO'
  entregadoPor: PromoDeliveredBy
}
type ExpenseDraft = {
  concept: string
  pesos: string
  rate: string
  usd: string
  payer: string
}
type Expense = {
  year: number
  month: string
  concept: string
  pesos: number | null
  rate: number | null
  usd: number
  payer: string
}

const sociasProfitOrder = ['Delfi', 'Mechi', 'Susan'] as const satisfies readonly SplitPartnerKey[]

function expenseRowArs(item: Expense, fallbackArsPerUsd: number): number {
  if (item.pesos != null && Number.isFinite(item.pesos) && item.pesos > 0) {
    return item.pesos
  }

  const rate =
    item.rate != null && Number.isFinite(item.rate) && item.rate > 0 ? item.rate : fallbackArsPerUsd

  return item.usd * rate
}

function sumExpensesArsForPayer(expenses: Expense[], payer: string, fallbackArsPerUsd: number): number {
  return expenses
    .filter((item) => item.payer === payer)
    .reduce((sum, item) => sum + expenseRowArs(item, fallbackArsPerUsd), 0)
}

const numberFormatter = new Intl.NumberFormat('es-AR')
const currencyArsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})
const currencyUsdFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
const sellerNames = ['Delfi', 'Mechi', 'Susan', 'Abrazandocuentos']
const appBasePath = import.meta.env.BASE_URL
const tabRoutes: Record<AppTab, string> = {
  home: '',
  ventas: 'ventas',
  encargos: 'encargos',
  promo: 'promos',
  gastos: 'gastos',
}
const tabByRoute = Object.fromEntries(
  Object.entries(tabRoutes).map(([tab, route]) => [route, tab]),
) as Record<string, AppTab>

const promoData = {
  equipo: [
    { nombre: 'Fede', unidades: 1, entregado: true, entregadoPor: null },
    { nombre: 'Lali', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Diego', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Wonky', unidades: 10, entregado: false, entregadoPor: null },
    { nombre: 'Mery Casabal', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Belu LM', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Susan', unidades: 5, entregado: false, entregadoPor: null },
    { nombre: 'Mechi', unidades: 5, entregado: true, entregadoPor: null },
    { nombre: 'Delfi', unidades: 5, entregado: true, entregadoPor: null },
  ],
  colaboracion: [
    { nombre: 'Dani', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Fide', unidades: 1, entregado: true, entregadoPor: null },
    { nombre: 'Lujan', unidades: 1, entregado: true, entregadoPor: null },
    { nombre: 'Magdalena', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Anita', unidades: 1, entregado: true, entregadoPor: null },
    { nombre: 'Tobi', unidades: 1, entregado: true, entregadoPor: null },
    { nombre: 'Agus Vera', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Marisol Otero', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Flor Otero', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Rocio Hernandez', unidades: 1, entregado: true, entregadoPor: null },
    { nombre: 'Juana Ibañez', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Mora Rivarola', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Juana Silveyra', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Paz Díaz Colodrero', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Vane Butera', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Agus Caballero', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Stephie Sibbald', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Clarita Eickert', unidades: 1, entregado: false, entregadoPor: null },
  ],
  influencers: [
    { nombre: 'Silvia Figgiacone', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Jose Pelayo', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Euge Boni', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Christian Plebst', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Mejor Descalzos', unidades: 1, entregado: false, entregadoPor: null },
    { nombre: 'Rochi', unidades: 0, entregado: false, entregadoPor: null },
    { nombre: 'Julieta Prandi', unidades: 0, entregado: false, entregadoPor: null },
    { nombre: 'Diego Torres', unidades: 0, entregado: false, entregadoPor: null },
    { nombre: 'Dai Ruggeri', unidades: 0, entregado: false, entregadoPor: null },
  ],
  colegio: [],
}

const gastosData: Expense[] = [
  { year: 2024, month: 'Septiembre', concept: 'Pistas Andres', pesos: 51800, rate: 1295, usd: 40, payer: 'Susan' },
  { year: 2024, month: 'Septiembre', concept: 'Pistas Andres', pesos: 51800, rate: 1295, usd: 40, payer: 'Delfi' },
  { year: 2024, month: 'Septiembre', concept: 'Pistas Andres', pesos: 51800, rate: 1295, usd: 40, payer: 'Mechi' },
  { year: 2024, month: 'Octubre', concept: 'Gestora', pesos: 75000, rate: 1170, usd: 64, payer: 'Delfi' },
  { year: 2025, month: 'Marzo', concept: 'Adelanto Diego', pesos: 244000, rate: 1220, usd: 200, payer: 'Delfi' },
  { year: 2025, month: 'Marzo', concept: 'Registro Sadaic', pesos: 90822, rate: 1220, usd: 75, payer: 'Mechi' },
  { year: 2025, month: 'Abril', concept: 'Adelantó Diego', pesos: 267000, rate: 1335, usd: 200, payer: 'Susan' },
  { year: 2025, month: 'Abril', concept: 'Adelantó Diego', pesos: 133500, rate: 1335, usd: 100, payer: 'Mechi' },
  { year: 2025, month: 'Junio', concept: 'Adelanto Diego', pesos: 117000, rate: 1170, usd: 100, payer: 'Delfi' },
  { year: 2025, month: 'Junio', concept: 'Gestora', pesos: 100000, rate: 1170, usd: 85, payer: 'Mechi' },
  { year: 2025, month: 'Junio', concept: 'Honorarios Mery', pesos: 250000, rate: 1170, usd: 214, payer: 'Susan' },
  { year: 2025, month: 'Junio', concept: 'Honorarios Belu', pesos: 250000, rate: 1170, usd: 214, payer: 'Mechi' },
  { year: 2025, month: 'Agosto', concept: 'Honorarios Diego saldo', pesos: null, rate: null, usd: 200, payer: 'Mechi' },
  { year: 2025, month: 'Agosto', concept: 'Honorarios Diego saldo', pesos: null, rate: null, usd: 300, payer: 'Delfi' },
  { year: 2025, month: 'Septiembre', concept: 'Gerard', pesos: 20000, rate: 1400, usd: 14, payer: 'Susan' },
  { year: 2025, month: 'Septiembre', concept: 'Gerard', pesos: 75000, rate: 1445, usd: 52, payer: 'Susan' },
  { year: 2025, month: 'Diciembre', concept: 'Estudio Barbosa', pesos: 75000, rate: 1475, usd: 51, payer: 'Susan' },
  { year: 2026, month: 'Enero', concept: 'Gerard saldo', pesos: 65000, rate: 1520, usd: 43, payer: 'Susan' },
  { year: 2026, month: 'Enero', concept: 'Coco grabacion', pesos: 20000, rate: 1495, usd: 13, payer: 'Delfi' },
  { year: 2026, month: 'Enero', concept: 'Magda grabacion', pesos: 100000, rate: 1490, usd: 67, payer: 'Mechi' },
  { year: 2026, month: 'Enero', concept: 'Vane grabacion', pesos: 15000, rate: 1495, usd: 10, payer: 'Delfi' },
  { year: 2026, month: 'Enero', concept: 'Susan/Agus grabacion', pesos: 75000, rate: 1480, usd: 50, payer: 'Susan' },
  { year: 2026, month: 'Marzo', concept: 'ISBN', pesos: 36500, rate: 1415, usd: 26, payer: 'Delfi' },
  { year: 2026, month: 'Marzo', concept: 'ISBN', pesos: 30500, rate: 1410, usd: 21, payer: 'Delfi' },
  { year: 2026, month: 'Marzo', concept: 'Imprenta x 2000', pesos: 882090, rate: 1405, usd: 628, payer: 'Delfi' },
  { year: 2026, month: 'Marzo', concept: 'Imprenta x 2000', pesos: 882090, rate: 1405, usd: 628, payer: 'Susan' },
  { year: 2026, month: 'Marzo', concept: 'Imprenta x 2000', pesos: 882090, rate: 1405, usd: 628, payer: 'Mechi' },
  { year: 2026, month: 'Marzo', concept: 'Grabación gotita', pesos: 100000, rate: 1405, usd: 71, payer: 'Delfi' },
  { year: 2026, month: 'Abril', concept: 'Grabación pasa', pesos: 50000, rate: 1395, usd: 36, payer: 'Delfi' },
  { year: 2026, month: 'Abril', concept: 'Grabación pasa', pesos: 120000, rate: 1410, usd: 85, payer: 'Susan' },
  { year: 2026, month: 'Abril', concept: 'Saldo imprenta', pesos: 680901, rate: 1420, usd: 480, payer: 'Susan' },
  { year: 2026, month: 'Abril', concept: 'Saldo imprenta', pesos: 680901, rate: 1420, usd: 480, payer: 'Delfi' },
  { year: 2026, month: 'Abril', concept: 'Saldo imprenta', pesos: 680901, rate: 1420, usd: 480, payer: 'Mechi' },
  { year: 2026, month: 'Abril', concept: 'Cap cut', pesos: 21300, rate: 1420, usd: 15, payer: 'Delfi' },
  { year: 2026, month: 'Abril', concept: 'Diego extras', pesos: 156510, rate: 1410, usd: 111, payer: 'Mechi' },
  { year: 2026, month: 'Abril', concept: 'Diego extras', pesos: 201630, rate: 1410, usd: 143, payer: 'Susan' },
  { year: 2026, month: 'Abril', concept: 'Folios x 1500', pesos: 61275, rate: 1390, usd: 44, payer: 'Delfi' },
  { year: 2026, month: 'Abril', concept: 'Stickers logo', pesos: 104400, rate: 1390, usd: 75, payer: 'Delfi' },
]

function App() {
  const [tab, setTab] = useState<AppTab>(() => getTabFromLocation())
  const [ventasData, setVentasData] = useState<VentasData>(fallbackVentasData)
  const [partnerSettlements, setPartnerSettlements] = useState<PartnerSettlement[]>([])
  const [expenses, setExpenses] = useState<Expense[]>(() => [...gastosData])
  const [acSchemeSoldQty, setAcSchemeSoldQty] = useState(0)
  const [acSliderPersistStatus, setAcSliderPersistStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const acSliderPersistClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [saleDetailEncargoSummary, setSaleDetailEncargoSummary] = useState(false)
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null)
  const [saleDraft, setSaleDraft] = useState<SaleDraft | null>(null)
  const [savingSaleId, setSavingSaleId] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [createDraft, setCreateDraft] = useState<SaleDraft | null>(null)
  const [newSaleSheetVariant, setNewSaleSheetVariant] = useState<'venta' | 'encargo'>('venta')
  const [saleDraftPresentation, setSaleDraftPresentation] = useState<'default' | 'encargoVender'>('default')
  const [savingNewSale, setSavingNewSale] = useState(false)
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null)
  const [savingStockAllocations, setSavingStockAllocations] = useState(false)
  const [stockAllocationError, setStockAllocationError] = useState<string | null>(null)
  const [togglingDeliveryId, setTogglingDeliveryId] = useState<string | null>(null)
  const [savingInvoiceSaleId, setSavingInvoiceSaleId] = useState<string | null>(null)
  const [promoRows, setPromoRows] = useState<PromoRowsStored>(() => loadPromoRows(promoData as PromoRowsStored))

  useEffect(() => {
    savePromoRows(promoRows)
  }, [promoRows])

  useEffect(() => {
    let ignore = false

    async function fetchVentasData() {
      try {
        setLoading(true)
        const data = await loadVentasData()

        if (!ignore) {
          const maxAc =
            data.stockAllocations.find((a) => a.name === AC_STOCK_NAME)?.copies ?? 0
          const saved = data.acSchemeSoldUnits
          const initial =
            saved === null ? maxAc : Math.min(Math.max(0, saved), maxAc)

          setVentasData(data)
          setAcSchemeSoldQty(initial)
          setLoadError(null)
        }
      } catch (error) {
        if (!ignore) {
          setLoadError(error instanceof Error ? error.message : 'No se pudo cargar Supabase.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchVentasData()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false

    loadPartnerSettlements()
      .then((rows) => {
        if (!ignore) {
          setPartnerSettlements(rows)
        }
      })
      .catch(() => {
        if (!ignore) {
          setPartnerSettlements([])
        }
      })

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    function syncTabFromHistory() {
      setTab(getTabFromLocation())
    }

    window.addEventListener('popstate', syncTabFromHistory)

    return () => {
      window.removeEventListener('popstate', syncTabFromHistory)
    }
  }, [])

  const { projectConfig, sales, stockAllocations } = ventasData
  const saleBreakdowns = sales.map((sale) => calculateSaleBreakdown(sale, projectConfig))
  const soldCopies = sales.reduce((total, sale) => total + (sale.quantity ?? 0), 0)
  const grossSalesArs = saleBreakdowns.reduce((total, item) => total + item.grossArs, 0)

  const ventasTabSales = useMemo(() => sales.filter((sale) => !isEncargoSale(sale)), [sales])
  const encargoSales = useMemo(() => sales.filter(isEncargoSale), [sales])
  const ventasTabBreakdowns = useMemo(
    () => ventasTabSales.map((sale) => calculateSaleBreakdown(sale, projectConfig)),
    [ventasTabSales, projectConfig],
  )
  const ventasTabGrossArs = ventasTabBreakdowns.reduce((total, item) => total + item.grossArs, 0)
  const ventasTabPaidArs = ventasTabSales.reduce((total, sale) => total + sale.paidArs, 0)
  const ventasTabPendingArs = ventasTabGrossArs - ventasTabPaidArs

  const abrSplit = useMemo(
    () => computeAbrInventorySplit(stockAllocations, projectConfig.costRules),
    [stockAllocations, projectConfig.costRules],
  )

  useEffect(() => {
    const max = abrSplit.acCopies
    setAcSchemeSoldQty((prev) => Math.min(prev, max))
  }, [abrSplit.acCopies])

  useEffect(() => {
    return () => {
      if (acSliderPersistClearRef.current) {
        window.clearTimeout(acSliderPersistClearRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (loading || loadError) {
      return
    }

    const max = abrSplit.acCopies
    const clamped = Math.min(Math.max(0, acSchemeSoldQty), max)
    const saved = ventasData.acSchemeSoldUnits
    const equivalent = saved !== null ? saved === clamped : clamped === max

    if (equivalent) {
      return
    }

    const handle = window.setTimeout(() => {
      if (acSliderPersistClearRef.current) {
        window.clearTimeout(acSliderPersistClearRef.current)
        acSliderPersistClearRef.current = null
      }

      setAcSliderPersistStatus('saving')

      void updateAcSchemeSoldUnits(clamped)
        .then(() => {
          setVentasData((current) => ({ ...current, acSchemeSoldUnits: clamped }))
          setAcSliderPersistStatus('saved')
          acSliderPersistClearRef.current = window.setTimeout(() => {
            setAcSliderPersistStatus('idle')
            acSliderPersistClearRef.current = null
          }, 2800)
        })
        .catch((error) => {
          console.error(error)
          setAcSliderPersistStatus('error')
        })
    }, 400)

    return () => window.clearTimeout(handle)
  }, [acSchemeSoldQty, loading, loadError, abrSplit.acCopies, ventasData.acSchemeSoldUnits])

  const acSliderGains = useMemo(
    () =>
      computeAbrazandoGananciasFromUnits(
        acSchemeSoldQty,
        projectConfig.costRules,
        abrSplit.referenceUnitPriceArs,
      ),
    [abrSplit.referenceUnitPriceArs, acSchemeSoldQty, projectConfig.costRules],
  )

  const partnerGainRows = useMemo(
    () => computeVentasMambulaSplits(grossSalesArs, soldCopies),
    [grossSalesArs, soldCopies],
  )

  async function savePartnerSettlement(input: {
    partner: SplitPartnerKey
    amountArs: number
    settledOn: string
  }) {
    const row = await createPartnerSettlement(input)
    setPartnerSettlements((current) => [row, ...current])
  }

  function selectTab(nextTab: AppTab) {
    setTab(nextTab)
    window.history.pushState(null, '', getPathForTab(nextTab))
  }

  async function copyPaymentAlias() {
    setCopyStatus('copied')
    window.setTimeout(() => setCopyStatus('idle'), 1400)

    try {
      await copyTextToClipboard(projectConfig.payment.alias)
    } catch {
      setCopyStatus('error')
      window.setTimeout(() => setCopyStatus('idle'), 1400)
    }
  }

  function startEditingSale(sale: Sale) {
    setCreateDraft(null)
    setSaleDraftPresentation('default')
    setEditingSaleId(sale.id)
    setEditError(null)
    setSaleDraft(saleToDraft(sale))
  }

  function openEncargoVenderSheet(sale: Sale) {
    setCreateDraft(null)
    setEditError(null)
    setSelectedSale(sale)
    setSaleDetailEncargoSummary(true)
    setSaleDraftPresentation('encargoVender')
    setEditingSaleId(sale.id)
    setSaleDraft(saleToDraft(sale))
  }

  function cancelEditingSale() {
    setEditingSaleId(null)
    setSaleDraft(null)
    setEditError(null)
    setSaleDraftPresentation('default')
  }

  function closeSaleDetail() {
    setSelectedSale(null)
    setSaleDetailEncargoSummary(false)
    cancelEditingSale()
  }

  function handleSelectSaleFromVentas(sale: Sale) {
    setSaleDetailEncargoSummary(false)
    setSelectedSale(sale)
  }

  function handleSelectSaleFromEncargosList(sale: Sale) {
    setSaleDetailEncargoSummary(true)
    setSelectedSale(sale)
  }

  async function saveEditingSale(saleId: string) {
    if (!saleDraft) return

    if (!saleDraft.buyer.trim()) {
      setEditError('Completá el nombre del comprador.')
      return
    }

    const cobradoErr = cobradoPaidValidationError(saleDraft)
    if (cobradoErr) {
      setEditError(cobradoErr)
      return
    }

    const input: SaleUpdateInput = {
      id: saleId,
      buyer: saleDraft.buyer.trim(),
      seller: emptyToNull(saleDraft.seller),
      quantity: parseOptionalNumber(saleDraft.quantity),
      unitPriceArs: parseOptionalNumber(saleDraft.unitPriceArs),
      paidArs: parseOptionalNumber(saleDraft.paidArs) ?? 0,
      paymentMethod: saleDraft.paymentMethod,
      paymentStatus: saleDraft.paymentStatus,
      invoiceStatus: saleDraft.invoiceStatus,
      delivered: emptyToNull(saleDraft.delivered),
      billingNotes: emptyToNull(saleDraft.billingNotes),
    }

    try {
      setSavingSaleId(saleId)
      const updatedSale = await updateSale(input)

      setVentasData((current) => ({
        ...current,
        sales: current.sales.map((sale) => (sale.id === saleId ? updatedSale : sale)),
      }))
      setSelectedSale(updatedSale)
      if (!isEncargoSale(updatedSale)) {
        setSaleDetailEncargoSummary(false)
      }
      cancelEditingSale()
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'No se pudo guardar la venta.')
    } finally {
      setSavingSaleId(null)
    }
  }

  function handleCreateSale() {
    setEditError(null)
    cancelEditingSale()
    setNewSaleSheetVariant(tab === 'encargos' ? 'encargo' : 'venta')
    setCreateDraft(createEmptySaleDraft())
  }

  async function saveNewSale() {
    if (!createDraft) return

    const input = draftToSaleInput(createDraft)

    if (!input.buyer) {
      setEditError('Completá el nombre del comprador.')
      return
    }

    if (newSaleSheetVariant === 'encargo') {
      const qty = parseOptionalNumber(createDraft.quantity)
      if (qty === null || qty <= 0) {
        setEditError('Completá la cantidad de unidades (mayor a cero).')
        return
      }
    }

    const cobradoErr = cobradoPaidValidationError(createDraft)
    if (cobradoErr) {
      setEditError(cobradoErr)
      return
    }

    try {
      setSavingNewSale(true)
      setEditError(null)
      const newSale = await createSale(input)

      setVentasData((current) => ({
        ...current,
        sales: [newSale, ...current.sales],
      }))
      selectTab(isEncargoSale(newSale) ? 'encargos' : 'ventas')
      setCreateDraft(null)
      setSaleDetailEncargoSummary(isEncargoSale(newSale))
      setSelectedSale(newSale)
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'No se pudo crear la venta.')
    } finally {
      setSavingNewSale(false)
    }
  }

  async function handleDeleteSale(sale: Sale) {
    try {
      setDeletingSaleId(sale.id)
      setEditError(null)
      await deleteSale(sale.id)

      setVentasData((current) => ({
        ...current,
        sales: current.sales.filter((item) => item.id !== sale.id),
      }))
      setSelectedSale(null)
      setSaleDetailEncargoSummary(false)
      cancelEditingSale()
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'No se pudo eliminar la venta.')
    } finally {
      setDeletingSaleId(null)
    }
  }

  async function toggleSaleDelivered(sale: Sale) {
    const nextDelivered = isDelivered(sale) ? 'NO' : 'SI'

    try {
      setTogglingDeliveryId(sale.id)
      setEditError(null)
      const updatedSale = await updateSale({
        id: sale.id,
        buyer: sale.buyer,
        seller: sale.seller,
        quantity: sale.quantity,
        unitPriceArs: sale.unitPriceArs,
        paidArs: sale.paidArs,
        paymentMethod: sale.paymentMethod,
        paymentStatus: sale.paymentStatus,
        invoiceStatus: sale.invoiceStatus ?? 'pendiente',
        delivered: nextDelivered,
        billingNotes: sale.billingNotes ?? null,
      })

      setVentasData((current) => ({
        ...current,
        sales: current.sales.map((item) => (item.id === sale.id ? updatedSale : item)),
      }))
      setSelectedSale((current) => (current?.id === sale.id ? updatedSale : current))
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'No se pudo actualizar la entrega.')
    } finally {
      setTogglingDeliveryId(null)
    }
  }

  async function updateSaleInvoiceStatus(sale: Sale, invoiceStatus: NonNullable<Sale['invoiceStatus']>) {
    try {
      setSavingInvoiceSaleId(sale.id)
      setEditError(null)
      const updatedSale = await updateInvoiceStatus(sale.id, invoiceStatus)

      setVentasData((current) => ({
        ...current,
        sales: current.sales.map((item) => (item.id === sale.id ? updatedSale : item)),
      }))
      setSelectedSale(updatedSale)
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'No se pudo actualizar la facturación.')
    } finally {
      setSavingInvoiceSaleId(null)
    }
  }

  async function saveStockAllocationChanges(allocations: StockAllocation[]) {
    try {
      setSavingStockAllocations(true)
      setStockAllocationError(null)
      const updatedAllocations = await updateStockAllocations(allocations)

      setVentasData((current) => ({
        ...current,
        stockAllocations: current.stockAllocations.map((allocation) => {
          return updatedAllocations.find((item) => item.name === allocation.name) ?? allocation
        }),
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar el inventario.'
      setStockAllocationError(message)
      throw new Error(message, { cause: error })
    } finally {
      setSavingStockAllocations(false)
    }
  }

  const saleEditSheetOpen = Boolean(
    selectedSale && editingSaleId && saleDraft && selectedSale.id === editingSaleId && !createDraft,
  )

  return (
    <main className="ios-app">
      {tab === 'home' ? (
        <HomeScreen
          abrSplit={abrSplit}
          acSchemeSoldQty={acSchemeSoldQty}
          acSliderPersistStatus={acSliderPersistStatus}
          acSliderGains={acSliderGains}
          copyPaymentAlias={copyPaymentAlias}
          copyStatus={copyStatus}
          expenses={expenses}
          grossSalesArs={grossSalesArs}
          loadError={loadError}
          loading={loading}
          onAcSchemeSoldQtyChange={setAcSchemeSoldQty}
          partnerGainRows={partnerGainRows}
          partnerSettlements={partnerSettlements}
          projectConfig={projectConfig}
          savePartnerSettlement={savePartnerSettlement}
          saveStockAllocationChanges={saveStockAllocationChanges}
          savingStockAllocations={savingStockAllocations}
          soldCopies={soldCopies}
          promoRows={promoRows}
          sales={sales}
          stockAllocationError={stockAllocationError}
          stockAllocations={stockAllocations}
        />
      ) : null}
      {tab === 'ventas' ? (
        <VentasScreen
          grossSalesArs={ventasTabGrossArs}
          paidSalesArs={ventasTabPaidArs}
          pendingSalesArs={ventasTabPendingArs}
          sales={ventasTabSales}
          togglingDeliveryId={togglingDeliveryId}
          onSelectSale={handleSelectSaleFromVentas}
          onToggleDelivered={toggleSaleDelivered}
        />
      ) : null}
      {tab === 'encargos' ? (
        <EncargosScreen
          sales={encargoSales}
          onSelectSale={handleSelectSaleFromEncargosList}
          onVenderEncargo={openEncargoVenderSheet}
        />
      ) : null}
      {tab === 'promo' ? (
        <PromocionalesScreen promoRows={promoRows} setPromoRows={setPromoRows} />
      ) : null}
      {tab === 'gastos' ? <GastosScreen expenses={expenses} setExpenses={setExpenses} /> : null}

      {selectedSale && !saleEditSheetOpen ? (
        saleDetailEncargoSummary ? (
          <EncargoSummarySheet
            sale={selectedSale}
            onClose={closeSaleDetail}
            onVender={openEncargoVenderSheet}
          />
        ) : (
          <SaleDetailSheet
            editError={editError}
            sale={selectedSale}
            savingInvoice={savingInvoiceSaleId === selectedSale.id}
            togglingDelivery={togglingDeliveryId === selectedSale.id}
            onClose={closeSaleDetail}
            deleting={deletingSaleId === selectedSale.id}
            deleteSale={handleDeleteSale}
            onToggleDelivered={toggleSaleDelivered}
            startEditingSale={startEditingSale}
            updateInvoiceStatus={updateSaleInvoiceStatus}
          />
        )
      ) : null}

      {createDraft ? (
        <SaleDraftSheet
          draft={createDraft}
          editError={editError}
          mode="create"
          submitting={savingNewSale}
          createVariant={newSaleSheetVariant}
          onClose={() => {
            setCreateDraft(null)
            setEditError(null)
          }}
          onSubmit={saveNewSale}
          setDraft={setCreateDraft}
        />
      ) : null}

      {saleEditSheetOpen && selectedSale && editingSaleId && saleDraft ? (
        <SaleDraftSheet
          draft={saleDraft}
          editError={editError}
          mode="edit"
          presentation={saleDraftPresentation}
          submitting={savingSaleId === editingSaleId}
          onClose={cancelEditingSale}
          onSubmit={() => saveEditingSale(editingSaleId)}
          setDraft={setSaleDraft}
        />
      ) : null}

      {tab === 'home' || tab === 'ventas' || tab === 'encargos' ? (
        <button
          aria-label={tab === 'encargos' ? 'Agregar encargo' : 'Agregar venta'}
          className="floating-add-button"
          onClick={handleCreateSale}
          type="button"
        >
          +
        </button>
      ) : null}

      <TabBar active={tab} onChange={selectTab} />
    </main>
  )
}

function PartnerSettlementSheet({
  breakdown,
  onClose,
  onSubmit,
  partnerSettlements,
}: {
  breakdown: PartnerGainBreakdown
  partnerSettlements: PartnerSettlement[]
  onClose: () => void
  onSubmit: (amountArs: number, settledOn: string) => Promise<void>
}) {
  const settledTotal = settlementsTotalForPartner(partnerSettlements, breakdown.partner)
  const pendingArs = Math.max(0, breakdown.totalGainArs - settledTotal)
  const [amount, setAmount] = useState(() => (pendingArs > 0 ? String(Math.round(pendingArs)) : ''))
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10))
  const [localError, setLocalError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSave() {
    const amt = parseOptionalNumber(amount)
    if (amt === null || amt <= 0) {
      setLocalError('Ingresá un monto válido.')
      return
    }

    if (amt > pendingArs + 0.005) {
      setLocalError('El monto no puede superar lo pendiente.')
      return
    }

    if (!dateStr) {
      setLocalError('Elegí una fecha.')
      return
    }

    try {
      setSubmitting(true)
      setLocalError(null)
      await onSubmit(amt, dateStr)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'No se pudo registrar el saldo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <h2>Saldar cuenta</h2>
            <p>{breakdown.partner}</p>
          </div>
          <button className="close-button" onClick={onClose} type="button">×</button>
        </div>

        <div className="new-sale-form">
          <div className="settlement-summary">
            <div className="sheet-list-item">
              <span>Ganancia total</span>
              <strong>{currencyArsFormatter.format(breakdown.totalGainArs)}</strong>
            </div>
            <div className="sheet-list-item">
              <span>Ya saldado</span>
              <strong>{currencyArsFormatter.format(settledTotal)}</strong>
            </div>
            <div className="sheet-list-item">
              <span>Pendiente</span>
              <strong>{currencyArsFormatter.format(pendingArs)}</strong>
            </div>
          </div>
          {breakdown.wonkyIllustratorUsd !== undefined ? (
            <p className="card-note">
              Incluye ilustración estimada {currencyUsdFormatter.format(breakdown.wonkyIllustratorUsd)} USD · tipo de cambio referencial.
            </p>
          ) : null}
          <div className="edit-grid">
            <input inputMode="decimal" placeholder="Monto a saldar (ARS)" value={amount} onChange={(event) => setAmount(event.target.value)} />
            <input type="date" value={dateStr} onChange={(event) => setDateStr(event.target.value)} />
          </div>
          {localError ? <p className="edit-error">{localError}</p> : null}
          <div className="edit-actions">
            <button className="secondary-button" disabled={submitting} onClick={onClose} type="button">Cancelar</button>
            <button className="primary-button" disabled={submitting || pendingArs <= 0} onClick={() => void handleSave()} type="button">
              {submitting ? 'Guardando...' : 'Registrar saldo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InventoryStockBar({
  promo,
  remainder,
  sold,
}: {
  promo: number
  remainder: number
  sold: number
}) {
  const total = promo + sold + remainder
  if (total <= 0) {
    return <div className="progress-track inventory-stock-bar tall empty" aria-hidden="true" />
  }

  return (
    <div className="progress-track inventory-stock-bar tall" aria-hidden="true">
      {promo > 0 ? <div className="inventory-stock-segment promo" style={{ flex: promo }} /> : null}
      {sold > 0 ? <div className="inventory-stock-segment sold" style={{ flex: sold }} /> : null}
      {remainder > 0 ? <div className="inventory-stock-segment remainder" style={{ flex: remainder }} /> : null}
    </div>
  )
}

function InventoryStockCounts({
  isSociaRow,
  movement,
}: {
  isSociaRow: boolean
  movement: InventoryMovementBreakdown
}) {
  if (isSociaRow) {
    return (
      <div className="inventory-stock-counts inventory-stock-counts--socia">
        <div className="inventory-stock-count-cell">
          <span className="inventory-stock-count-dot promo" />
          <span className="inventory-stock-count-label">promo</span>
          <span className="inventory-stock-count-value">{numberFormatter.format(movement.promo)}</span>
        </div>
        <div className="inventory-stock-count-cell">
          <span className="inventory-stock-count-dot sold" />
          <span className="inventory-stock-count-label">vendidos</span>
          <span className="inventory-stock-count-value">{numberFormatter.format(movement.sold)}</span>
        </div>
        <div className="inventory-stock-count-cell">
          <span className="inventory-stock-count-dot remainder" />
          <span className="inventory-stock-count-label">stock</span>
          <span className="inventory-stock-count-value">{numberFormatter.format(movement.remainder)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="inventory-stock-counts inventory-stock-counts--ac">
      <div className="inventory-stock-count-cell">
        <span className="inventory-stock-count-dot sold" />
        <span className="inventory-stock-count-label">vendidos</span>
        <span className="inventory-stock-count-value">{numberFormatter.format(movement.sold)}</span>
      </div>
      <div className="inventory-stock-count-cell">
        <span className="inventory-stock-count-dot remainder" />
        <span className="inventory-stock-count-label">stock</span>
        <span className="inventory-stock-count-value">{numberFormatter.format(movement.remainder)}</span>
      </div>
    </div>
  )
}

function HomeScreen({
  abrSplit,
  acSchemeSoldQty,
  acSliderPersistStatus,
  acSliderGains,
  copyPaymentAlias,
  copyStatus,
  expenses,
  grossSalesArs,
  loadError,
  loading,
  onAcSchemeSoldQtyChange,
  partnerGainRows,
  partnerSettlements,
  projectConfig,
  promoRows,
  sales,
  savePartnerSettlement,
  saveStockAllocationChanges,
  savingStockAllocations,
  soldCopies,
  stockAllocationError,
  stockAllocations,
}: {
  abrSplit: AbrInventorySplit
  acSchemeSoldQty: number
  acSliderPersistStatus: 'idle' | 'saving' | 'saved' | 'error'
  acSliderGains: AbrazandoGananciasPreview
  copyPaymentAlias: () => void
  copyStatus: 'idle' | 'copied' | 'error'
  expenses: Expense[]
  grossSalesArs: number
  loadError: string | null
  loading: boolean
  onAcSchemeSoldQtyChange: (units: number) => void
  partnerGainRows: PartnerGainBreakdown[]
  partnerSettlements: PartnerSettlement[]
  projectConfig: VentasData['projectConfig']
  promoRows: PromoRowsStored
  sales: Sale[]
  savePartnerSettlement: (input: {
    partner: SplitPartnerKey
    amountArs: number
    settledOn: string
  }) => Promise<void>
  saveStockAllocationChanges: (allocations: StockAllocation[]) => Promise<void>
  savingStockAllocations: boolean
  soldCopies: number
  stockAllocationError: string | null
  stockAllocations: VentasData['stockAllocations']
}) {
  const [settleRow, setSettleRow] = useState<PartnerGainBreakdown | null>(null)
  const [abrDatosOpen, setAbrDatosOpen] = useState(false)
  const [ventasMambulaNoteOpen, setVentasMambulaNoteOpen] = useState(false)
  const [editingInventory, setEditingInventory] = useState(false)
  const inventoryTableRows = useMemo(() => {
    const rows = allocationsForHomeInventoryTable(stockAllocations)
    const acRows = rows.filter((row) => row.name === AC_STOCK_NAME)
    const otherRows = rows.filter((row) => row.name !== AC_STOCK_NAME)
    return [...otherRows, ...acRows]
  }, [stockAllocations])
  const [stockDraft, setStockDraft] = useState<StockAllocationDraft>(() => {
    return createStockAllocationDraft(allocationsForHomeInventoryTable(stockAllocations))
  })
  const [localStockError, setLocalStockError] = useState<string | null>(null)
  const availableCopies = projectConfig.firstPrintRun.copies - soldCopies
  const copiesPerBox = projectConfig.firstPrintRun.copies / projectConfig.firstPrintRun.boxes
  const inventoryError = localStockError ?? stockAllocationError
  const acSliderMax = Math.max(0, abrSplit.acCopies)
  const sliderValue = Math.min(Math.max(0, acSchemeSoldQty), acSliderMax)

  const liquidacionesParticipantes = useMemo(
    () =>
      partnerGainRows.map((row) => {
        const saldado = settlementsTotalForPartner(partnerSettlements, row.partner)
        return {
          nombre: row.partner,
          ganancia: row.totalGainArs,
          saldado,
          pendiente: Math.max(0, row.totalGainArs - saldado),
        }
      }),
    [partnerGainRows, partnerSettlements],
  )

  const expenseFallbackArsPerUsd = useMemo(
    () => estimateArsPerUsdFromExpenseRates(expenses.map((item) => item.rate)),
    [expenses],
  )

  const sociasProfitRows = useMemo(() => {
    const acEach = acSliderGains.gananciaPorSociaAcArs

    return sociasProfitOrder.map((partner) => {
      const ventasRow = partnerGainRows.find((row) => row.partner === partner)
      const gananciaMambulaArs = ventasRow?.totalGainArs ?? 0
      const gastosArs = sumExpensesArsForPayer(expenses, partner, expenseFallbackArsPerUsd)

      return {
        partner,
        gananciaAcArs: acEach,
        gananciaMambulaArs,
        gastosArs,
      }
    })
  }, [
    acSliderGains.gananciaPorSociaAcArs,
    expenseFallbackArsPerUsd,
    expenses,
    partnerGainRows,
  ])

  function startEditingInventory() {
    setStockDraft(createStockAllocationDraft(inventoryTableRows))
    setLocalStockError(null)
    setEditingInventory(true)
  }

  function cancelEditingInventory() {
    setStockDraft(createStockAllocationDraft(inventoryTableRows))
    setLocalStockError(null)
    setEditingInventory(false)
  }

  async function saveEditingInventory() {
    const nextAllocations = inventoryTableRows.map((allocation) => ({
      name: allocation.name,
      copies: parseStockNumber(stockDraft[allocation.name]?.copies),
      boxes: parseStockNumber(stockDraft[allocation.name]?.boxes),
    }))
    const copiesTotal = nextAllocations.reduce((total, item) => total + item.copies, 0)
    const boxesTotal = nextAllocations.reduce((total, item) => total + item.boxes, 0)

    if (copiesTotal > projectConfig.firstPrintRun.copies) {
      setLocalStockError(`El total no puede superar ${numberFormatter.format(projectConfig.firstPrintRun.copies)} ejemplares.`)
      return
    }

    if (boxesTotal > projectConfig.firstPrintRun.boxes) {
      setLocalStockError(`El total no puede superar ${numberFormatter.format(projectConfig.firstPrintRun.boxes)} cajas.`)
      return
    }

    try {
      setLocalStockError(null)
      await saveStockAllocationChanges(nextAllocations)
      setEditingInventory(false)
    } catch {
      // The parent state exposes the persistence error in the card.
    }
  }

  return (
    <section className="screen">
      <ScreenHeader
        eyebrow={projectConfig.projectName}
        title="Dashboard"
        subtitle="Inventario, ventas y reparto de costos para la primera tirada del proyecto."
      />
      <div className="screen-stack">
        <div className="ios-card alias-card">
          <span className="muted-label">Mercado Pago</span>
          <div className="alias-row">
            <strong>{projectConfig.payment.alias}</strong>
            <button className="small-icon-button" onClick={copyPaymentAlias} type="button">
              {copyStatus === 'copied' ? '✓' : copyStatus === 'error' ? '!' : <CopyIcon />}
            </button>
          </div>
          <span className="muted-label">Alias para transferencias de ventas</span>
        </div>

        <div className="sync-badge">
          <span className={loadError ? 'sync-dot error' : 'sync-dot'} />
          {loadError
            ? `No se pudo leer Supabase: ${loadError}`
            : loading
              ? 'Cargando datos desde Supabase...'
              : 'Datos sincronizados desde Supabase'}
        </div>

        <div className="kpi-grid">
          <StatCard label="Primera tirada" sub="ejemplares" value={numberFormatter.format(projectConfig.firstPrintRun.copies)} />
          <StatCard label="Cajas" sub={`${numberFormatter.format(copiesPerBox)} libros por caja`} value={numberFormatter.format(projectConfig.firstPrintRun.boxes)} />
          <StatCard label="Vendidos" sub={`${numberFormatter.format(availableCopies)} disponibles`} value={numberFormatter.format(soldCopies)} />
          <StatCard label="Ingresos" sub="desde ventas" value={currencyArsFormatter.format(grossSalesArs)} />
        </div>

        <div className="ios-card">
          <div className="inventory-card-head">
            <SectionTitle eyebrow="Inventario" title="División de ejemplares y cajas" />
            {editingInventory ? null : (
              <button className="row-edit-button" onClick={startEditingInventory} type="button">
                Editar
              </button>
            )}
          </div>
          <span className="soft-pill">
            {numberFormatter.format(projectConfig.firstPrintRun.copies)} libros ·{' '}
            {numberFormatter.format(projectConfig.firstPrintRun.boxes)} cajas
          </span>
          {inventoryError ? <p className="edit-error inventory-error">{inventoryError}</p> : null}
          <div className="inventory-table">
            <div className="inventory-head">
              <span>Destino</span>
              <span>Ejemplares</span>
              <span>Cajas</span>
            </div>
            {inventoryTableRows.map((item) => {
              const allocationCopies = editingInventory
                ? parseStockNumber(stockDraft[item.name]?.copies)
                : item.copies

              const promoUnits = promoDeliveredUnitsForStockRow(promoRows, item.name)
              const soldUnits = soldUnitsAttributedToSeller(sales, item.name)
              const movement = breakdownInventoryMovement(allocationCopies, promoUnits, soldUnits, item.name)
              const isSociaRow = item.name === 'Delfi' || item.name === 'Mechi' || item.name === 'Susan'

              return (
                <div className="inventory-row" key={item.name}>
                  <div className="inventory-values">
                    <span>{item.name}</span>
                    {editingInventory ? (
                      <>
                        <input
                          inputMode="numeric"
                          value={stockDraft[item.name]?.copies ?? ''}
                          onChange={(event) => setStockDraft({
                            ...stockDraft,
                            [item.name]: {
                              copies: event.target.value,
                              boxes: stockDraft[item.name]?.boxes ?? '',
                            },
                          })}
                        />
                        <input
                          inputMode="numeric"
                          value={stockDraft[item.name]?.boxes ?? ''}
                          onChange={(event) => setStockDraft({
                            ...stockDraft,
                            [item.name]: {
                              copies: stockDraft[item.name]?.copies ?? '',
                              boxes: event.target.value,
                            },
                          })}
                        />
                      </>
                    ) : (
                      <>
                        <span>{numberFormatter.format(item.copies)}</span>
                        <span>{numberFormatter.format(item.boxes)}</span>
                      </>
                    )}
                  </div>
                  <InventoryStockBar
                    promo={movement.promo}
                    remainder={movement.remainder}
                    sold={movement.sold}
                  />
                  <InventoryStockCounts isSociaRow={isSociaRow} movement={movement} />
                </div>
              )
            })}
          </div>
          {editingInventory ? (
            <div className="edit-actions inventory-actions">
              <button className="secondary-button" onClick={cancelEditingInventory} type="button">
                Cancelar
              </button>
              <button className="primary-button" disabled={savingStockAllocations} onClick={saveEditingInventory} type="button">
                {savingStockAllocations ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          ) : null}
        </div>

        <div className="ios-card dashboard-split-card">
          <SectionTitle eyebrow="Liquidacion" title="ABRAZANDOCUENTOS" />

          <h4 className="dashboard-ganancias-subtitle">
            <span>Ganancias:</span>
            {acSliderPersistStatus === 'saving' ? (
              <span className="ac-slider-persist-badge muted">Guardando...</span>
            ) : null}
            {acSliderPersistStatus === 'saved' ? (
              <span className="ac-slider-persist-badge success">Guardado</span>
            ) : null}
            {acSliderPersistStatus === 'error' ? (
              <span className="ac-slider-persist-badge danger">No se pudo guardar</span>
            ) : null}
          </h4>
          <div className="ac-scheme-slider-block">
            <label className="ac-scheme-slider-label" htmlFor="ac-scheme-slider">
              Ejemplares vendidos en este esquema:{' '}
              <strong>{numberFormatter.format(sliderValue)}</strong>
              {' · máx. '}
              <strong>{numberFormatter.format(acSliderMax)}</strong>
            </label>
            <input
              aria-valuemax={acSliderMax}
              aria-valuemin={0}
              aria-valuenow={sliderValue}
              className="ac-scheme-slider"
              disabled={acSliderMax <= 0}
              id="ac-scheme-slider"
              max={acSliderMax}
              min={0}
              onChange={(event) => onAcSchemeSoldQtyChange(Number(event.target.value))}
              step={1}
              type="range"
              value={sliderValue}
            />
          </div>
          <table className="dashboard-mini-table">
            <tbody>
              <tr>
                <td>Ingreso referencial</td>
                <td>{currencyArsFormatter.format(acSliderGains.poolGrossArs)}</td>
              </tr>
              <tr>
                <td>Ganancia Abrazando cuentos</td>
                <td>{currencyArsFormatter.format(acSliderGains.gananciaAbrazandoCuentosArs)}</td>
              </tr>
              <tr>
                <td>Ganancia Wonky (pool)</td>
                <td>{currencyArsFormatter.format(acSliderGains.gananciaWonkyArs)}</td>
              </tr>
              <tr>
                <td>Pool Socias (Delfi, Mechi, Susan)</td>
                <td>{currencyArsFormatter.format(acSliderGains.poolSociasArs)}</td>
              </tr>
              <tr>
                <td>Cada socia (share AC)</td>
                <td>{currencyArsFormatter.format(acSliderGains.gananciaPorSociaAcArs)}</td>
              </tr>
            </tbody>
          </table>

          <div className="dashboard-disclosure">
            <button
              aria-controls="abr-datos-panel"
              aria-expanded={abrDatosOpen}
              className="dashboard-disclosure-trigger"
              id="abr-datos-trigger"
              onClick={() => {
                setAbrDatosOpen((open) => !open)
              }}
              type="button"
            >
              <span className="dashboard-disclosure-title">Valores</span>
              <span
                aria-hidden
                className={abrDatosOpen ? 'dashboard-disclosure-chevron is-open' : 'dashboard-disclosure-chevron'}
              >
                <Icon name="chevron-down" />
              </span>
            </button>
            <div
              className="dashboard-disclosure-panel"
              hidden={!abrDatosOpen}
              id="abr-datos-panel"
              role="region"
              aria-labelledby="abr-datos-trigger"
            >
              <table className="dashboard-mini-table">
                <tbody>
                  <tr>
                    <td>% Abrazando cuentos</td>
                    <td>{`${abrSplit.pctAbrazandoCuentos * 100}%`}</td>
                  </tr>
                  <tr>
                    <td>% Wonky</td>
                    <td>{`${abrSplit.pctWonky * 100}%`}</td>
                  </tr>
                  <tr>
                    <td>% Socias (pool)</td>
                    <td>{`${abrSplit.pctSociasPool * 100}%`}</td>
                  </tr>
                  <tr>
                    <td>Costo por libro</td>
                    <td>{currencyUsdFormatter.format(abrSplit.costoLibroUsd)}</td>
                  </tr>
                  <tr>
                    <td>Ejemplares (stock)</td>
                    <td>{numberFormatter.format(abrSplit.acCopies)}</td>
                  </tr>
                  <tr>
                    <td>Cajas (stock)</td>
                    <td>{numberFormatter.format(abrSplit.acBoxes)}</td>
                  </tr>
                  <tr>
                    <td>Precio venta referencia</td>
                    <td>{currencyArsFormatter.format(abrSplit.referenceUnitPriceArs)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <LiquidacionesVentasCard
          explainDetail={
            <>
              Bruto por venta = ejemplares × precio unitario. Wonky suma{' '}
              {currencyArsFormatter.format(WONKY_ARS_PER_VENTA_COPY)} por cada ejemplar vendido en total (
              {numberFormatter.format(soldCopies)} u.). Del bruto total se descuenta ese monto y lo restante se divide
              en tres entre las socias. <strong>Abrazandocuentos</strong> no participa de esta tabla (queda en el bloque
              ABRAZANDOCUENTOS).
            </>
          }
          explainExpanded={ventasMambulaNoteOpen}
          formatArs={(n) => currencyArsFormatter.format(n)}
          onSaldar={(p) => {
            const row = partnerGainRows.find((r) => r.partner === p.nombre)
            if (row) {
              setSettleRow(row)
            }
          }}
          onToggleExplain={() => setVentasMambulaNoteOpen((open) => !open)}
          participantes={liquidacionesParticipantes}
          totalBruto={grossSalesArs}
          totalEjemplares={soldCopies}
          wonkyPorLibroArs={WONKY_ARS_PER_VENTA_COPY}
        />

        <ProfitCard
          socias={sociasProfitRows.map((row) => ({
            nombre: row.partner,
            liqAC: row.gananciaAcArs,
            liqMambula: row.gananciaMambulaArs,
            gastos: row.gastosArs,
          }))}
        />

        {partnerSettlements.length > 0 ? (
          <div className="ios-card">
            <div className="settlement-history-block settlement-history-block--flush">
              <h4>Movimientos de saldo</h4>
              <ul className="settlement-history-list">
                {partnerSettlements.map((entry) => (
                  <li key={entry.id}>
                    <span>{entry.partner}</span>
                    <span>{currencyArsFormatter.format(entry.amountArs)}</span>
                    <span>{entry.settledOn}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {settleRow ? (
          <PartnerSettlementSheet
            key={`${settleRow.partner}-${settlementsTotalForPartner(partnerSettlements, settleRow.partner)}-${partnerSettlements.length}`}
            breakdown={settleRow}
            partnerSettlements={partnerSettlements}
            onClose={() => setSettleRow(null)}
            onSubmit={async (amountArs, settledOn) => {
              await savePartnerSettlement({
                partner: settleRow.partner,
                amountArs,
                settledOn,
              })
              setSettleRow(null)
            }}
          />
        ) : null}
      </div>
    </section>
  )
}

function VentasScreen({
  grossSalesArs,
  paidSalesArs,
  pendingSalesArs,
  onSelectSale,
  onToggleDelivered,
  sales,
  togglingDeliveryId,
}: {
  grossSalesArs: number
  paidSalesArs: number
  pendingSalesArs: number
  onSelectSale: (sale: Sale) => void
  onToggleDelivered: (sale: Sale) => void
  sales: Sale[]
  togglingDeliveryId: string | null
}) {
  const [filter, setFilter] = useState<'todas' | 'pendiente' | 'porEntregar' | 'porFacturar'>('todas')
  const [query, setQuery] = useState('')
  const [sellerFilter, setSellerFilter] = useState<string | null>(null)

  const sellerScopedSales = useMemo(() => {
    return sellerFilter ? sales.filter((sale) => sale.seller === sellerFilter) : sales
  }, [sales, sellerFilter])

  const filteredSales = useMemo(() => {
    return sellerScopedSales.filter((sale) => {
      const matchesFilter =
        filter === 'todas' ||
        (filter === 'pendiente' && isSalePending(sale)) ||
        (filter === 'porEntregar' && !isDelivered(sale)) ||
        (filter === 'porFacturar' && isInvoicePending(sale))
      const matchesQuery = sale.buyer.toLowerCase().includes(query.toLowerCase())

      return matchesFilter && matchesQuery
    })
  }, [filter, query, sellerScopedSales])

  const pendingCount = sellerScopedSales.filter(isSalePending).length
  const deliveryCount = sellerScopedSales.filter((sale) => !isDelivered(sale)).length
  const invoicePendingCount = sellerScopedSales.filter(isInvoicePending).length
  const sellerTotals = useMemo(() => {
    return sellerNames
      .filter((seller) => seller !== AC_STOCK_NAME)
      .map((seller) => {
      const sellerSales = sales.filter((sale) => sale.seller === seller)

      return {
        seller,
        count: sellerSales.length,
        total: sellerSales.reduce((sum, sale) => sum + getSaleTotal(sale), 0),
      }
    })
  }, [sales])

  return (
    <section className="screen">
      <ScreenHeader
        eyebrow="Mambula"
        title="Ventas"
        subtitle={`${sales.length} transacciones · Mayo 2026`}
      />

      <div className="search-box">
        <Icon name="search" />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar consumidor"
          value={query}
        />
      </div>

      <div className="stats-row">
        <StatCard label="Total vendido" value={formatCompact(grossSalesArs)} />
        <StatCard accent="green" label="Pagado" value={formatCompact(paidSalesArs)} />
        <StatCard accent="orange" label="Por pagar" value={formatCompact(pendingSalesArs)} />
      </div>

      <div className="seller-stats">
        {sellerTotals.map((item) => (
          <button
            className={sellerFilter === item.seller ? 'stat-card seller-stat selected' : 'stat-card seller-stat'}
            key={item.seller}
            onClick={() => {
              setSellerFilter((current) => (current === item.seller ? null : item.seller))
              setFilter('todas')
            }}
            type="button"
          >
            <span>{item.seller}</span>
            <strong>{formatCompact(item.total)}</strong>
            <p>{item.count} {item.count === 1 ? 'venta' : 'ventas'}</p>
          </button>
        ))}
      </div>

      <Segmented
        active={filter}
        options={[
          { key: 'todas', label: 'Todas', count: sellerScopedSales.length },
          { key: 'pendiente', label: 'Por pagar', count: pendingCount },
          { key: 'porEntregar', label: 'Por entregar', count: deliveryCount },
          { key: 'porFacturar', label: 'Por facturar', count: invoicePendingCount },
        ]}
        onChange={setFilter}
      />

      <div className="list-group">
        {filteredSales.map((sale, index) => (
          <SaleRow
            isLast={index === filteredSales.length - 1}
            key={sale.id}
            sale={sale}
            togglingDelivery={togglingDeliveryId === sale.id}
            onSelectSale={onSelectSale}
            onToggleDelivered={onToggleDelivered}
          />
        ))}
      </div>

      {filteredSales.length === 0 ? <p className="empty-message">Sin resultados</p> : null}
    </section>
  )
}

function EncargosScreen({
  onSelectSale,
  onVenderEncargo,
  sales,
}: {
  onSelectSale: (sale: Sale) => void
  onVenderEncargo: (sale: Sale) => void
  sales: Sale[]
}) {
  const [query, setQuery] = useState('')
  const [sellerFilter, setSellerFilter] = useState<string | null>(null)

  const encargoSellerStats = useMemo(() => {
    return sellerNames
      .filter((seller) => seller !== 'Abrazandocuentos')
      .map((seller) => ({
        seller,
        count: sales.filter((sale) => sale.seller === seller).length,
      }))
  }, [sales])

  const sellerScopedSales = useMemo(() => {
    if (!sellerFilter) return sales

    return sales.filter((sale) => sale.seller === sellerFilter)
  }, [sales, sellerFilter])

  const filteredSales = useMemo(() => {
    const normalized = query.toLowerCase()

    return sellerScopedSales.filter((sale) => sale.buyer.toLowerCase().includes(normalized))
  }, [query, sellerScopedSales])

  const pendingEncargosArs = useMemo(() => {
    return sales.reduce((sum, sale) => sum + Math.max(0, getSalePending(sale)), 0)
  }, [sales])

  return (
    <section className="screen">
      <ScreenHeader
        eyebrow="Mambula"
        title="Encargos"
        subtitle={`Sin entregar ni cobrar · ${sales.length} ${sales.length === 1 ? 'registro' : 'registros'} · Por cobrar ${formatCompact(pendingEncargosArs)}`}
      />

      <div className="search-box">
        <Icon name="search" />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar consumidor"
          value={query}
        />
      </div>

      <div className="seller-stats">
        {encargoSellerStats.map((item) => (
          <button
            className={sellerFilter === item.seller ? 'stat-card seller-stat selected' : 'stat-card seller-stat'}
            key={item.seller}
            onClick={() => {
              setSellerFilter((current) => (current === item.seller ? null : item.seller))
            }}
            type="button"
          >
            <span>{item.seller}</span>
            <strong>{item.count}</strong>
            <p>{item.count === 1 ? 'encargo' : 'encargos'}</p>
          </button>
        ))}
      </div>

      <div className="list-group">
        {filteredSales.map((sale, index) => (
          <EncargoRow
            isLast={index === filteredSales.length - 1}
            key={sale.id}
            sale={sale}
            onSelectSale={onSelectSale}
            onVenderEncargo={onVenderEncargo}
          />
        ))}
      </div>

      {filteredSales.length === 0 ? (
        <p className="empty-message">{sales.length === 0 ? 'Sin encargos activos' : 'Sin resultados'}</p>
      ) : null}
    </section>
  )
}

function EncargoSellerPill({ seller }: { seller: string }) {
  const display = seller.trim() || 'Sin vendedor'
  const slug = display.toLowerCase().replace(/\s+/g, '-')
  const knownSlugs = new Set(['susan', 'delfi', 'mechi', 'abrazandocuentos', 'sin-vendedor'])
  const payerClass = knownSlugs.has(slug) ? `payer-${slug}` : 'payer-encargo-otro'

  return <span className={`payer-chip ${payerClass}`}>{display}</span>
}

function EncargoRow({
  isLast,
  onSelectSale,
  onVenderEncargo,
  sale,
}: {
  isLast: boolean
  onSelectSale: (sale: Sale) => void
  onVenderEncargo: (sale: Sale) => void
  sale: Sale
}) {
  const qtyShort =
    sale.quantity === null || sale.quantity === undefined ? null : `x${sale.quantity}`
  const qtyAria =
    sale.quantity === null || sale.quantity === undefined
      ? 'Cantidad sin definir'
      : `${sale.quantity} ${sale.quantity === 1 ? 'unidad' : 'unidades'}`

  return (
    <div className={`encargo-row sale-row ${isLast ? 'last' : ''}`}>
      <div
        className="encargo-row-body"
        onClick={() => onSelectSale(sale)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelectSale(sale)
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="encargo-row-leading">
          <span aria-label={qtyAria} className="encargo-qty-circle" title={qtyAria}>
            {qtyShort ?? '–'}
          </span>
          <div className="encargo-row-copy">
            <strong>{sale.buyer}</strong>
            <EncargoSellerPill seller={sale.seller ?? ''} />
          </div>
        </div>
      </div>
      <button
        className="primary-button encargo-vender-button"
        onClick={(event) => {
          event.stopPropagation()
          onVenderEncargo(sale)
        }}
        type="button"
      >
        Vender
      </button>
    </div>
  )
}

function SaleRow({
  isLast,
  onSelectSale,
  onToggleDelivered,
  sale,
  togglingDelivery,
}: {
  isLast: boolean
  onSelectSale: (sale: Sale) => void
  onToggleDelivered: (sale: Sale) => void
  sale: Sale
  togglingDelivery: boolean
}) {
  const totalArs = getSaleTotal(sale)
  const pendingArs = getSalePending(sale)
  const status = getSaleStatus(sale)

  return (
    <div
      className={`sale-row ${isLast ? 'last' : ''}`}
      onClick={() => onSelectSale(sale)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelectSale(sale)
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="sale-row-main">
        <div className="sale-row-left">
          <strong>{sale.buyer}</strong>
          <div className="sale-row-meta">
            <span>{sale.quantity ?? '-'} {sale.quantity === 1 ? 'unidad' : 'unidades'}</span>
            <span>·</span>
            <span>{sale.seller ?? 'Sin vendedor'}</span>
          </div>
        </div>
        <div className="sale-row-side">
          <span className={pendingArs > 0 ? 'amount danger' : 'amount'}>{currencyArsFormatter.format(totalArs)}</span>
          <StatusPill kind={status} />
        </div>
      </div>
      <div className="sale-row-actions">
        <InvoiceIcon status={sale.invoiceStatus ?? 'pendiente'} />
        <DeliveryIndicator
          delivered={isDelivered(sale)}
          disabled={togglingDelivery}
          onClick={(event) => {
            event.stopPropagation()
            onToggleDelivered(sale)
          }}
        />
      </div>
    </div>
  )
}

function EncargoSummarySheet({
  onClose,
  onVender,
  sale,
}: {
  onClose: () => void
  onVender: (sale: Sale) => void
  sale: Sale
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <h2>Encargo</h2>
            <p>Nombre del comprador, vendedora y cantidad de ejemplares.</p>
          </div>
          <button className="close-button" onClick={onClose} type="button">×</button>
        </div>

        <div className="new-sale-form">
          <div className="new-sale-stack">
            <div className="new-sale-field">
              <span className="new-sale-field-label" id="encargo-sum-buyer-label">
                Comprador
              </span>
              <input
                aria-labelledby="encargo-sum-buyer-label"
                className="new-sale-input"
                readOnly
                tabIndex={-1}
                value={sale.buyer}
              />
            </div>

            <div className="new-sale-field">
              <span className="new-sale-field-label" id="encargo-sum-seller-label">
                Vendedor
              </span>
              <input
                aria-labelledby="encargo-sum-seller-label"
                className="new-sale-input"
                readOnly
                tabIndex={-1}
                value={sale.seller ?? ''}
              />
            </div>

            <div className="new-sale-field">
              <span className="new-sale-field-label" id="encargo-sum-qty-label">
                Unidades
              </span>
              <input
                aria-labelledby="encargo-sum-qty-label"
                className="new-sale-input"
                readOnly
                tabIndex={-1}
                value={sale.quantity?.toString() ?? ''}
              />
            </div>
          </div>

          <button className="primary-button full" onClick={() => onVender(sale)} type="button">
            Vender
          </button>
        </div>
      </div>
    </div>
  )
}

function SaleDetailSheet({
  deleting,
  deleteSale,
  editError,
  onClose,
  onToggleDelivered,
  sale,
  savingInvoice,
  startEditingSale,
  togglingDelivery,
  updateInvoiceStatus,
}: {
  deleting: boolean
  deleteSale: (sale: Sale) => void
  editError: string | null
  onClose: () => void
  onToggleDelivered: (sale: Sale) => void
  sale: Sale
  savingInvoice: boolean
  startEditingSale: (sale: Sale) => void
  togglingDelivery: boolean
  updateInvoiceStatus: (sale: Sale, invoiceStatus: NonNullable<Sale['invoiceStatus']>) => void
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const totalArs = getSaleTotal(sale)
  const pendingArs = getSalePending(sale)
  const paidPct = totalArs > 0 ? Math.round((sale.paidArs / totalArs) * 100) : 0
  const status = getSaleStatus(sale)

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <Avatar name={sale.buyer} size={56} />
          <div>
            <h2>{sale.buyer}</h2>
            <p>Vendedor {sale.seller ?? '-'}</p>
          </div>
          <button className="close-button" onClick={onClose} type="button">×</button>
        </div>

        {editError ? <p className="edit-error">{editError}</p> : null}

        <div className="sheet-amount">
          <span>Total de la venta</span>
          <strong>{currencyArsFormatter.format(totalArs)}</strong>
          <StatusPill kind={status} />
        </div>

        <div className="ios-card progress-card">
          <div className="progress-label">
            <span>Cobrado</span>
            <strong>{paidPct}%</strong>
          </div>
          <div className="progress-track tall">
            <div className={pendingArs > 0 ? 'progress-fill orange' : 'progress-fill green'} style={{ width: `${paidPct}%` }} />
          </div>
          <div className="progress-values">
            <span>Pagado {currencyArsFormatter.format(sale.paidArs)}</span>
            <span>Por pagar {currencyArsFormatter.format(pendingArs)}</span>
          </div>
        </div>

        <ListGroup title="Desglose">
          <ListItem label="Unidades" value={sale.quantity?.toString() ?? '-'} />
          <ListItem label="Precio unitario" value={sale.unitPriceArs === null ? '-' : currencyArsFormatter.format(sale.unitPriceArs)} />
          <ListItem label="Subtotal" value={currencyArsFormatter.format(totalArs)} />
          <ListItem label="Vendedor" value={sale.seller ?? '-'} />
        </ListGroup>
        <ListGroup title="Entrega">
          <div className="sheet-list-item sheet-list-item-delivery">
            <span>Estado</span>
            <DeliveryStatusToggle
              delivered={isDelivered(sale)}
              disabled={togglingDelivery}
              onSelectDelivered={(next) => {
                if (next === isDelivered(sale)) return
                void onToggleDelivered(sale)
              }}
            />
          </div>
          <ListItem label="Nota" value={sale.billingNotes ?? '-'} />
        </ListGroup>
        <ListGroup title="Facturación">
          <div className="sheet-list-item">
            <span>Estado</span>
            <select
              className="sheet-select"
              disabled={savingInvoice}
              value={sale.invoiceStatus ?? 'pendiente'}
              onChange={(event) => updateInvoiceStatus(sale, event.target.value as NonNullable<Sale['invoiceStatus']>)}
            >
              <option value="no_aplica">No se factura</option>
              <option value="pendiente">Pendiente</option>
              <option value="facturado">Facturado</option>
            </select>
          </div>
        </ListGroup>
        <button className="primary-button full" onClick={() => startEditingSale(sale)} type="button">
          Editar venta
        </button>
        {confirmingDelete ? (
          <div className="delete-confirmation">
            <strong>¿Eliminar esta venta?</strong>
            <p>Esta acción borra el registro de Supabase y no se puede deshacer.</p>
            <div className="delete-actions">
              <button className="secondary-button" onClick={() => setConfirmingDelete(false)} type="button">
                Cancelar
              </button>
              <button className="danger-button" disabled={deleting} onClick={() => deleteSale(sale)} type="button">
                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        ) : (
          <button className="danger-link-button" onClick={() => setConfirmingDelete(true)} type="button">
            Eliminar venta
          </button>
        )}
      </div>
    </div>
  )
}

const UNIT_PRICE_ARS_VALUES = [15000, 12500, 7500] as const

function unitPriceSegmentActive(unitPriceArs: string): string {
  const trimmed = unitPriceArs.trim()
  if (trimmed === '') return String(UNIT_PRICE_ARS_VALUES[0])
  const numeric = parseOptionalNumber(trimmed)
  if (numeric !== null && UNIT_PRICE_ARS_VALUES.some((v) => v === numeric)) return String(numeric)
  return `extra:${trimmed}`
}

function unitPriceSegmentLabel(trimmed: string): string {
  const numeric = parseOptionalNumber(trimmed)
  const n = numeric !== null && Number.isFinite(numeric) ? numeric : 0
  return `$${formatUnitPriceOptionLabel(n)}`
}

function unitPriceSegmentOptions(unitPriceArs: string): Array<{ key: string; label: string }> {
  const base = UNIT_PRICE_ARS_VALUES.map((ars) => ({
    key: String(ars),
    label: `$${formatUnitPriceOptionLabel(ars)}`,
  }))
  const trimmed = unitPriceArs.trim()
  const numeric = parseOptionalNumber(trimmed)
  if (
    trimmed === '' ||
    (numeric !== null && UNIT_PRICE_ARS_VALUES.some((v) => v === numeric))
  ) {
    return base
  }
  return [...base, { key: `extra:${trimmed}`, label: unitPriceSegmentLabel(trimmed) }]
}

function unitPriceFromSegmentKey(key: string): string {
  return key.startsWith('extra:') ? key.slice(6) : key
}

function formatUnitPriceOptionLabel(ars: number) {
  return ars.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

const SOCIA_SELLERS = ['Delfi', 'Mechi', 'Susan'] as const
type SociasSeller = (typeof SOCIA_SELLERS)[number]

function SaleDraftSheet({
  createVariant = 'venta',
  draft,
  editError,
  mode,
  onClose,
  onSubmit,
  presentation = 'default',
  setDraft,
  submitting,
}: {
  createVariant?: 'venta' | 'encargo'
  draft: SaleDraft
  editError: string | null
  mode: 'create' | 'edit'
  onClose: () => void
  onSubmit: () => void
  presentation?: 'default' | 'encargoVender'
  setDraft: (draft: SaleDraft) => void
  submitting: boolean
}) {
  const minimalEncargoCreate = mode === 'create' && createVariant === 'encargo'
  const encargoVenderLabels = mode === 'edit' && presentation === 'encargoVender'

  const title = minimalEncargoCreate
    ? 'Nuevo encargo'
    : encargoVenderLabels
      ? 'Nueva venta'
      : mode === 'edit'
        ? 'Editar venta'
        : 'Nueva venta'

  const subtitle = minimalEncargoCreate
    ? 'Nombre del comprador, vendedora y cantidad de ejemplares.'
    : 'Cargá los detalles antes de guardar el registro.'

  const submitLabel = minimalEncargoCreate
    ? 'Crear encargo'
    : encargoVenderLabels
      ? 'Guardar venta'
      : mode === 'edit'
        ? 'Guardar cambios'
        : 'Crear venta'

  const useSellerSelect =
    mode === 'edit' &&
    draft.seller.trim() !== '' &&
    !(SOCIA_SELLERS as readonly string[]).includes(draft.seller.trim())

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="close-button" onClick={onClose} type="button">×</button>
        </div>

        <div className="new-sale-form">
          <div className="new-sale-stack">
            <div className="new-sale-field">
              <span className="new-sale-field-label" id="new-sale-buyer-label">
                Comprador
              </span>
              <input
                aria-labelledby="new-sale-buyer-label"
                className="new-sale-input"
                placeholder="Nombre"
                value={draft.buyer}
                onChange={(event) => setDraft({ ...draft, buyer: event.target.value })}
              />
            </div>

            <div className="new-sale-field">
              <span className="new-sale-field-label">Vendedor</span>
              {useSellerSelect ? (
                <SellerSelect value={draft.seller} onChange={(seller) => setDraft({ ...draft, seller })} />
              ) : (
                <Segmented<SociasSeller>
                  active={
                    SOCIA_SELLERS.includes(draft.seller as SociasSeller)
                      ? (draft.seller as SociasSeller)
                      : 'Delfi'
                  }
                  onChange={(seller) => setDraft({ ...draft, seller })}
                  options={[
                    { key: 'Delfi', label: 'Delfi' },
                    { key: 'Mechi', label: 'Mechi' },
                    { key: 'Susan', label: 'Susan' },
                  ]}
                />
              )}
            </div>

            {minimalEncargoCreate ? (
              <div className="new-sale-field">
                <span className="new-sale-field-label" id="new-sale-qty-label">
                  Unidades
                </span>
                <input
                  aria-labelledby="new-sale-qty-label"
                  className="new-sale-input"
                  inputMode="numeric"
                  placeholder="0"
                  value={draft.quantity}
                  onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
                />
              </div>
            ) : (
              <>
                <div className="new-sale-row2">
                  <div className="new-sale-field">
                    <span className="new-sale-field-label" id="new-sale-qty-label-full">
                      Unidades
                    </span>
                    <input
                      aria-labelledby="new-sale-qty-label-full"
                      className="new-sale-input"
                      inputMode="numeric"
                      placeholder="0"
                      value={draft.quantity}
                      onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
                    />
                  </div>
                  <div className="new-sale-field">
                    <span className="new-sale-field-label" id="new-sale-paid-label">
                      Pagado (ARS)
                    </span>
                    <input
                      aria-labelledby="new-sale-paid-label"
                      className="new-sale-input"
                      inputMode="numeric"
                      placeholder="0"
                      value={draft.paidArs}
                      onChange={(event) => setDraft({ ...draft, paidArs: event.target.value })}
                    />
                  </div>
                </div>

                <div className="new-sale-field">
                  <span className="new-sale-field-label">Precio unitario</span>
                  <Segmented<string>
                    active={unitPriceSegmentActive(draft.unitPriceArs)}
                    onChange={(key) => setDraft({ ...draft, unitPriceArs: unitPriceFromSegmentKey(key) })}
                    options={unitPriceSegmentOptions(draft.unitPriceArs)}
                  />
                </div>

                <div className="new-sale-field">
                  <span className="new-sale-field-label">Medio de pago</span>
                  <Segmented<Sale['paymentMethod']>
                    active={draft.paymentMethod}
                    onChange={(paymentMethod) => setDraft({ ...draft, paymentMethod })}
                    options={[
                      { key: 'transferencia', label: 'Transferencia' },
                      { key: 'efectivo', label: 'Efectivo' },
                      { key: 'otro', label: 'Otro' },
                    ]}
                  />
                </div>

                <div className="new-sale-field">
                  <span className="new-sale-field-label">Pago</span>
                  <Segmented<Sale['paymentStatus']>
                    active={draft.paymentStatus}
                    onChange={(paymentStatus) => setDraft({ ...draft, paymentStatus })}
                    options={[
                      { key: 'pendiente', label: 'Por pagar' },
                      { key: 'cobrado', label: 'Cobrado' },
                    ]}
                  />
                </div>

                <div className="new-sale-field">
                  <span className="new-sale-field-label">Facturación</span>
                  <Segmented<NonNullable<Sale['invoiceStatus']>>
                    active={draft.invoiceStatus}
                    onChange={(invoiceStatus) => setDraft({ ...draft, invoiceStatus })}
                    options={[
                      { key: 'no_aplica', label: 'No se factura' },
                      { key: 'pendiente', label: 'Pendiente' },
                      { key: 'facturado', label: 'Facturado' },
                    ]}
                  />
                </div>

                <div className="new-sale-field">
                  <span className="new-sale-field-label">Entregado</span>
                  <Segmented<'SI' | 'NO'>
                    active={draft.delivered.trim().toUpperCase() === 'SI' ? 'SI' : 'NO'}
                    onChange={(delivered) => setDraft({ ...draft, delivered })}
                    options={[
                      { key: 'NO', label: 'No' },
                      { key: 'SI', label: 'Sí' },
                    ]}
                  />
                </div>

                <div className="new-sale-field">
                  <span className="new-sale-field-label" id="new-sale-notes-label">
                    Nota
                  </span>
                  <input
                    aria-labelledby="new-sale-notes-label"
                    className="new-sale-input"
                    placeholder="Opcional"
                    value={draft.billingNotes}
                    onChange={(event) => setDraft({ ...draft, billingNotes: event.target.value })}
                  />
                </div>
              </>
            )}
          </div>
          {editError ? <p className="edit-error">{editError}</p> : null}
          <div className="edit-actions">
            <button className="secondary-button" onClick={onClose} type="button">Cancelar</button>
            <button className="primary-button" disabled={submitting} onClick={onSubmit} type="button">
              {submitting ? 'Guardando...' : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
function PromocionalesScreen({
  promoRows,
  setPromoRows,
}: {
  promoRows: PromoRowsStored
  setPromoRows: Dispatch<SetStateAction<PromoRowsStored>>
}) {
  const [filter, setFilter] = useState<'todos' | 'pendientes' | 'entregados'>('todos')
  const [promoDraft, setPromoDraft] = useState<PromoDraft | null>(null)
  const [promoError, setPromoError] = useState<string | null>(null)
  const [promoDeliverPick, setPromoDeliverPick] = useState<{ group: PromoGroup; nombre: string } | null>(
    null,
  )
  const [promoEditTarget, setPromoEditTarget] = useState<{ group: PromoGroup; nombre: string } | null>(null)

  const all = [...promoRows.equipo, ...promoRows.colaboracion, ...promoRows.influencers, ...promoRows.colegio]
  const total = all.reduce((sum, row) => sum + row.unidades, 0)
  const delivered = all.filter((row) => row.entregado).reduce((sum, row) => sum + row.unidades, 0)

  function handlePromoCheckTap(group: PromoGroup, nombre: string) {
    const row = promoRows[group].find((item) => item.nombre === nombre)
    if (!row) return

    if (row.entregado) {
      setPromoRows((current) => ({
        ...current,
        [group]: current[group].map((item) =>
          item.nombre === nombre ? { ...item, entregado: false, entregadoPor: null } : item,
        ),
      }))
    } else {
      setPromoDeliverPick({ group, nombre })
    }
  }

  function confirmPromoDelivered(by: PromoDeliveredBy) {
    if (!promoDeliverPick) return

    const { group, nombre } = promoDeliverPick

    setPromoRows((current) => ({
      ...current,
      [group]: current[group].map((item) =>
        item.nombre === nombre ? { ...item, entregado: true, entregadoPor: by } : item,
      ),
    }))
    setPromoDeliverPick(null)
  }

  function savePromo() {
    if (!promoDraft) return

    const nombre = promoDraft.nombre.trim()
    const unidades = parseStockNumber(promoDraft.unidades)

    if (!nombre) {
      setPromoError('Completá el nombre.')
      return
    }

    setPromoRows((current) => ({
      ...current,
      [promoDraft.group]: [
        ...current[promoDraft.group],
        {
          nombre,
          unidades,
          entregado: promoDraft.entregado === 'SI',
          entregadoPor: promoDraft.entregado === 'SI' ? promoDraft.entregadoPor : null,
        },
      ],
    }))
    setPromoDraft(null)
    setPromoError(null)
  }

  const promoEditRow =
    promoEditTarget &&
    promoRows[promoEditTarget.group].find((item) => item.nombre === promoEditTarget.nombre)

  function submitPromoEdit(draft: PromoEditDraft): string | null {
    if (!promoEditTarget) return 'Sesión inválida.'

    const { group, nombre: nombreOriginal } = promoEditTarget
    const nombre = draft.nombre.trim()
    if (!nombre) return 'Completá el nombre.'

    const unidades = parseStockNumber(draft.unidades)
    const list = promoRows[group]
    const idx = list.findIndex((item) => item.nombre === nombreOriginal)
    if (idx === -1) return 'No se encontró el registro.'

    const nombreLc = nombre.toLowerCase()
    if (list.some((item, i) => i !== idx && item.nombre.trim().toLowerCase() === nombreLc)) {
      return 'Ya existe otro registro con ese nombre en esta lista.'
    }

    const entregado = draft.entregado === 'SI'
    const entregadoPor = entregado ? draft.entregadoPor : null

    setPromoRows((current) => ({
      ...current,
      [group]: current[group].map((item, i) =>
        i === idx ? { nombre, unidades, entregado, entregadoPor } : item,
      ),
    }))

    return null
  }

  return (
    <section className="screen">
      <ScreenHeader
        eyebrow="Mambula"
        title="Promocionales"
        subtitle="Ejemplares entregados al equipo, colaboradores, colegios e influencers."
      />
      <div className="stats-row">
        <button
          className={filter === 'todos' ? 'stat-card promo-filter-card selected' : 'stat-card promo-filter-card'}
          onClick={() => setFilter('todos')}
          type="button"
        >
          <span>Total</span>
          <strong>{numberFormatter.format(total)}</strong>
        </button>
        <button
          className={filter === 'entregados' ? 'stat-card promo-filter-card selected' : 'stat-card promo-filter-card'}
          onClick={() => setFilter('entregados')}
          type="button"
        >
          <span>Entregados</span>
          <strong className="accent-green">{numberFormatter.format(delivered)}</strong>
        </button>
        <button
          className={filter === 'pendientes' ? 'stat-card promo-filter-card selected' : 'stat-card promo-filter-card'}
          onClick={() => setFilter('pendientes')}
          type="button"
        >
          <span>Pendientes</span>
          <strong className="accent-orange">{numberFormatter.format(total - delivered)}</strong>
        </button>
      </div>
      <PromoSection
        filter={filter}
        group="equipo"
        rows={promoRows.equipo}
        title="Equipo Mambula"
        onEditRow={(group, nombre) => setPromoEditTarget({ group, nombre })}
        onPromoCheckTap={handlePromoCheckTap}
      />
      <PromoSection
        filter={filter}
        group="colaboracion"
        rows={promoRows.colaboracion}
        title="Colaboradores"
        onEditRow={(group, nombre) => setPromoEditTarget({ group, nombre })}
        onPromoCheckTap={handlePromoCheckTap}
      />
      <PromoSection
        filter={filter}
        group="colegio"
        rows={promoRows.colegio}
        title="Colegios"
        onEditRow={(group, nombre) => setPromoEditTarget({ group, nombre })}
        onPromoCheckTap={handlePromoCheckTap}
      />
      <PromoSection
        filter={filter}
        group="influencers"
        rows={promoRows.influencers}
        title="Prensa & influencers"
        onEditRow={(group, nombre) => setPromoEditTarget({ group, nombre })}
        onPromoCheckTap={handlePromoCheckTap}
      />
      {promoEditTarget && promoEditRow ? (
        <PromoEditSheet
          key={`${promoEditTarget.group}-${promoEditTarget.nombre}`}
          row={promoEditRow}
          onClose={() => setPromoEditTarget(null)}
          onSave={submitPromoEdit}
        />
      ) : null}
      {promoDeliverPick ? (
        <PromoDeliverWhoSheet
          key={`${promoDeliverPick.group}-${promoDeliverPick.nombre}`}
          nombre={promoDeliverPick.nombre}
          onClose={() => setPromoDeliverPick(null)}
          onConfirm={confirmPromoDelivered}
        />
      ) : null}
      {promoDraft ? (
        <NewPromoSheet
          draft={promoDraft}
          error={promoError}
          onClose={() => {
            setPromoDraft(null)
            setPromoError(null)
          }}
          onSave={savePromo}
          setDraft={setPromoDraft}
        />
      ) : null}
      <button
        aria-label="Agregar promocional"
        className="floating-add-button red"
        onClick={() => setPromoDraft(createEmptyPromoDraft())}
        type="button"
      >
        +
      </button>
    </section>
  )
}

function GastosScreen({
  expenses,
  setExpenses,
}: {
  expenses: Expense[]
  setExpenses: Dispatch<SetStateAction<Expense[]>>
}) {
  const [filter, setFilter] = useState('todos')
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft | null>(null)
  const [expenseError, setExpenseError] = useState<string | null>(null)
  const filtered = filter === 'todos' ? expenses : expenses.filter((item) => item.payer === filter)
  const expenseIndexMap = useMemo(() => {
    const map = new Map<Expense, number>()
    expenses.forEach((item, index) => map.set(item, index))

    return map
  }, [expenses])
  const sortedFiltered = useMemo(
    () => [...filtered].sort((a, b) => compareExpensesNewestFirst(a, b, expenseIndexMap)),
    [filtered, expenseIndexMap],
  )
  const totalUsd = expenses.reduce((sum, item) => sum + item.usd, 0)
  const totalPesos = expenses.reduce((sum, item) => sum + (item.pesos ?? 0), 0)
  const payerTotals = ['Susan', 'Delfi', 'Mechi'].map((payer) => {
    const items = expenses.filter((item) => item.payer === payer)

    return {
      count: items.length,
      payer,
      pesos: items.reduce((sum, item) => sum + (item.pesos ?? 0), 0),
      usd: items.reduce((sum, item) => sum + item.usd, 0),
    }
  })
  const groups = groupBy(sortedFiltered, (item) => `${item.month} ${item.year}`)

  function saveExpense() {
    if (!expenseDraft) return

    const concept = expenseDraft.concept.trim()
    const usd = parseOptionalNumber(expenseDraft.usd) ?? 0

    if (!concept) {
      setExpenseError('Completá el concepto.')
      return
    }

    setExpenses((current) => [
      ...current,
      {
        concept,
        pesos: parseOptionalNumber(expenseDraft.pesos),
        rate: parseOptionalNumber(expenseDraft.rate),
        usd,
        payer: expenseDraft.payer,
        ...getCurrentExpenseDate(),
      },
    ])
    setExpenseDraft(null)
    setExpenseError(null)
  }

  return (
    <section className="screen">
      <ScreenHeader
        eyebrow="Mambula"
        title="Gastos"
        subtitle="Producción, honorarios, imprenta y costos asociados al proyecto."
      />
      <div className="ios-card big-total-card">
        <span>Total invertido</span>
        <strong>{currencyUsdFormatter.format(totalUsd)}</strong>
        <p>Equivalente a {currencyArsFormatter.format(totalPesos)}</p>
      </div>
      <div className="payer-stats">
        {payerTotals.map((item) => (
          <button
            className={filter === item.payer ? 'stat-card payer-stat selected' : 'stat-card payer-stat'}
            key={item.payer}
            onClick={() => setFilter((current) => (current === item.payer ? 'todos' : item.payer))}
            type="button"
          >
            <span>{item.payer}</span>
            <strong>{currencyUsdFormatter.format(item.usd)}</strong>
            <p>{item.count} gastos · {currencyArsFormatter.format(item.pesos)}</p>
          </button>
        ))}
      </div>
      {groups.map(([month, rows]) => (
        <div className="expense-group" key={month}>
          <div className="group-title">
            <span>{month}</span>
            <strong>{currencyUsdFormatter.format(rows.reduce((sum, row) => sum + row.usd, 0))}</strong>
          </div>
          <div className="list-group">
            {rows.map((item, index) => (
              <div className={`expense-row ${index === rows.length - 1 ? 'last' : ''}`} key={`${item.concept}-${index}`}>
                <div>
                  <strong>{item.concept}</strong>
                  <p>
                    {item.pesos === null
                      ? `${item.month} ${item.year}`
                      : `${item.month} ${item.year} · ${currencyArsFormatter.format(item.pesos)} · $${item.rate}`}
                  </p>
                </div>
                <div className="expense-side">
                  <strong>{currencyUsdFormatter.format(item.usd)}</strong>
                  <PayerChip name={item.payer} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {expenseDraft ? (
        <NewExpenseSheet
          draft={expenseDraft}
          error={expenseError}
          onClose={() => {
            setExpenseDraft(null)
            setExpenseError(null)
          }}
          onSave={saveExpense}
          setDraft={setExpenseDraft}
        />
      ) : null}
      <button
        aria-label="Agregar gasto"
        className="floating-add-button green"
        onClick={() => setExpenseDraft(createEmptyExpenseDraft())}
        type="button"
      >
        +
      </button>
    </section>
  )
}

function PromoEditSheet({
  onClose,
  onSave,
  row,
}: {
  onClose: () => void
  onSave: (draft: PromoEditDraft) => string | null
  row: PromoRowStored
}) {
  const [draft, setDraft] = useState<PromoEditDraft>(() => ({
    nombre: row.nombre,
    unidades: String(row.unidades),
    entregado: row.entregado ? 'SI' : 'NO',
    entregadoPor: row.entregadoPor ?? 'Delfi',
  }))
  const [error, setError] = useState<string | null>(null)

  function handleSave() {
    const message = onSave(draft)
    if (message) {
      setError(message)

      return
    }

    setError(null)
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <h2>Editar promocional</h2>
          </div>
          <button className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="new-sale-form">
          <div className="edit-grid">
            <span className="muted-label promo-draft-deliver-label">Entregado a:</span>
            <input
              className="wide"
              placeholder="Nombre"
              value={draft.nombre}
              onChange={(event) => setDraft({ ...draft, nombre: event.target.value })}
            />
            <span className="muted-label promo-draft-deliver-label">Cantidad de ejemplares:</span>
            <input
              className="wide"
              inputMode="numeric"
              placeholder="Unidades"
              value={draft.unidades}
              onChange={(event) => setDraft({ ...draft, unidades: event.target.value })}
            />
            <span className="muted-label promo-draft-deliver-label">¿Quién lo entregó?</span>
            <div className="promo-draft-deliver-segmented">
              <Segmented
                active={draft.entregadoPor}
                onChange={(entregadoPor) => setDraft({ ...draft, entregadoPor })}
                options={PROMO_DELIVER_OPTIONS}
              />
            </div>
            <span className="muted-label promo-draft-deliver-label">¿Entregado?</span>
            <div className="promo-draft-deliver-segmented">
              <Segmented
                active={draft.entregado}
                onChange={(entregado) =>
                  setDraft({
                    ...draft,
                    entregado,
                    entregadoPor: entregado === 'SI' ? draft.entregadoPor || 'Delfi' : draft.entregadoPor,
                  })
                }
                options={PROMO_ENTREGADO_SI_NO_OPTIONS}
              />
            </div>
          </div>
          {error ? <p className="edit-error">{error}</p> : null}
          <div className="edit-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              Cancelar
            </button>
            <button className="primary-button red" onClick={handleSave} type="button">
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PromoDeliverWhoSheet({
  nombre,
  onClose,
  onConfirm,
}: {
  nombre: string
  onClose: () => void
  onConfirm: (by: PromoDeliveredBy) => void
}) {
  const [socia, setSocia] = useState<PromoDeliveredBy>('Delfi')

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <h2>¿Quién entregó?</h2>
            <p>{nombre}</p>
          </div>
          <button className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="new-sale-form promo-deliver-sheet-body">
          <span className="muted-label">Socia</span>
          <Segmented active={socia} onChange={setSocia} options={PROMO_DELIVER_OPTIONS} />
          <div className="edit-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              Cancelar
            </button>
            <button className="primary-button red" onClick={() => onConfirm(socia)} type="button">
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NewPromoSheet({
  draft,
  error,
  onClose,
  onSave,
  setDraft,
}: {
  draft: PromoDraft
  error: string | null
  onClose: () => void
  onSave: () => void
  setDraft: (draft: PromoDraft) => void
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <h2>Nuevo promocional</h2>
          </div>
          <button className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="new-sale-form">
          <div className="edit-grid">
            <span className="muted-label promo-draft-deliver-label">Entregado a:</span>
            <input
              className="wide"
              placeholder="Nombre"
              value={draft.nombre}
              onChange={(event) => setDraft({ ...draft, nombre: event.target.value })}
            />
            <span className="muted-label promo-draft-deliver-label">Cantidad de ejemplares:</span>
            <input
              className="wide"
              inputMode="numeric"
              placeholder="Unidades"
              value={draft.unidades}
              onChange={(event) => setDraft({ ...draft, unidades: event.target.value })}
            />
            <span className="muted-label promo-draft-deliver-label">¿Quién lo entregó?</span>
            <div className="promo-draft-deliver-segmented">
              <Segmented
                active={draft.entregadoPor}
                onChange={(entregadoPor) => setDraft({ ...draft, entregadoPor })}
                options={PROMO_DELIVER_OPTIONS}
              />
            </div>
            <span className="muted-label promo-draft-deliver-label">¿Entregado?</span>
            <div className="promo-draft-deliver-segmented">
              <Segmented
                active={draft.entregado}
                onChange={(entregado) =>
                  setDraft({
                    ...draft,
                    entregado,
                    entregadoPor: entregado === 'SI' ? draft.entregadoPor || 'Delfi' : draft.entregadoPor,
                  })
                }
                options={PROMO_ENTREGADO_SI_NO_OPTIONS}
              />
            </div>
            <span className="muted-label promo-draft-deliver-label">Lista</span>
            <select
              className="wide"
              value={draft.group}
              onChange={(event) => setDraft({ ...draft, group: event.target.value as PromoGroup })}
            >
              <option value="equipo">Equipo</option>
              <option value="colaboracion">Colaboración</option>
              <option value="colegio">Colegio</option>
              <option value="influencers">Influencers</option>
            </select>
          </div>
          {error ? <p className="edit-error">{error}</p> : null}
          <div className="edit-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              Cancelar
            </button>
            <button className="primary-button red" onClick={onSave} type="button">
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NewExpenseSheet({
  draft,
  error,
  onClose,
  onSave,
  setDraft,
}: {
  draft: ExpenseDraft
  error: string | null
  onClose: () => void
  onSave: () => void
  setDraft: (draft: ExpenseDraft) => void
}) {
  function updatePesos(pesos: string) {
    const rate = parseOptionalNumber(draft.rate)

    setDraft({
      ...draft,
      pesos,
      usd: rate ? formatDraftNumber((parseOptionalNumber(pesos) ?? 0) / rate) : draft.usd,
    })
  }

  function updateRate(rateValue: string) {
    const rate = parseOptionalNumber(rateValue)
    const pesos = parseOptionalNumber(draft.pesos)
    const usd = parseOptionalNumber(draft.usd)

    setDraft({
      ...draft,
      rate: rateValue,
      pesos: rate && !pesos && usd ? formatDraftNumber(usd * rate) : draft.pesos,
      usd: rate && pesos ? formatDraftNumber(pesos / rate) : draft.usd,
    })
  }

  function updateUsd(usdValue: string) {
    const rate = parseOptionalNumber(draft.rate)

    setDraft({
      ...draft,
      usd: usdValue,
      pesos: rate ? formatDraftNumber((parseOptionalNumber(usdValue) ?? 0) * rate) : draft.pesos,
    })
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <h2>Nuevo gasto</h2>
            <p>Cargá el concepto, monto y quién lo pagó.</p>
          </div>
          <button className="close-button" onClick={onClose} type="button">×</button>
        </div>

        <div className="new-sale-form">
          <div className="edit-grid">
            <input className="wide" placeholder="Concepto" value={draft.concept} onChange={(event) => setDraft({ ...draft, concept: event.target.value })} />
            <input inputMode="decimal" placeholder="Pesos" value={draft.pesos} onChange={(event) => updatePesos(event.target.value)} />
            <input inputMode="decimal" placeholder="Tipo de cambio" value={draft.rate} onChange={(event) => updateRate(event.target.value)} />
            <input inputMode="decimal" placeholder="USD" value={draft.usd} onChange={(event) => updateUsd(event.target.value)} />
            <select value={draft.payer} onChange={(event) => setDraft({ ...draft, payer: event.target.value })}>
              <option value="Susan">Susan</option>
              <option value="Delfi">Delfi</option>
              <option value="Mechi">Mechi</option>
            </select>
          </div>
          {error ? <p className="edit-error">{error}</p> : null}
          <div className="edit-actions">
            <button className="secondary-button" onClick={onClose} type="button">Cancelar</button>
            <button className="primary-button green" onClick={onSave} type="button">Crear gasto</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PromoSection({
  filter,
  group,
  onEditRow,
  onPromoCheckTap,
  rows,
  title,
}: {
  filter: 'todos' | 'pendientes' | 'entregados'
  group: keyof typeof promoData
  onEditRow: (group: keyof typeof promoData, nombre: string) => void
  onPromoCheckTap: (group: keyof typeof promoData, nombre: string) => void
  rows: PromoRowStored[]
  title: string
}) {
  const visibleRows = rows.filter((row) => {
    if (filter === 'pendientes') return !row.entregado && row.unidades > 0
    if (filter === 'entregados') return row.entregado
    return true
  })
  const total = rows.reduce((sum, row) => sum + row.unidades, 0)
  const delivered = rows.filter((row) => row.entregado).reduce((sum, row) => sum + row.unidades, 0)
  const pct = total > 0 ? Math.round((delivered / total) * 100) : 0

  return (
    <section className="promo-section">
      <div className="promo-heading">
        <div>
          <h2>{title}</h2>
        </div>
        <strong>{delivered}/{total} · {pct}%</strong>
      </div>
      <div className="progress-track">
        <div className="progress-fill green" style={{ width: `${pct}%` }} />
      </div>
      <div className="list-group">
        {visibleRows.map((row, index) => (
          <div
            className={`promo-row promo-row--editable ${index === visibleRows.length - 1 ? 'last' : ''}`}
            key={row.nombre}
            onClick={() => onEditRow(group, row.nombre)}
          >
            <Avatar name={row.nombre} size={34} />
            <strong>{row.nombre}</strong>
            <div className="promo-row-tail">
              {row.entregado && row.entregadoPor ? <PayerChip name={row.entregadoPor} /> : null}
              <span className="promo-row-units">{row.unidades > 0 ? `${row.unidades} u.` : '—'}</span>
              <button
                aria-label={`${row.entregado ? 'Marcar como no entregado' : 'Marcar como entregado'}: ${row.nombre}`}
                className={row.entregado ? 'check-circle done' : 'check-circle'}
                onClick={(event) => {
                  event.stopPropagation()
                  onPromoCheckTap(group, row.nombre)
                }}
                type="button"
              >
                {row.entregado ? '✓' : ''}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ScreenHeader({
  eyebrow,
  subtitle,
  title,
  trailing,
}: {
  eyebrow: string
  subtitle: string
  title: string
  trailing?: React.ReactNode
}) {
  return (
    <header className="screen-header">
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <span>{subtitle}</span>
      </div>
      {trailing}
    </header>
  )
}

function StatCard({
  accent,
  label,
  sub,
  value,
}: {
  accent?: 'green' | 'orange' | string
  label: string
  sub?: string
  value: string
}) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong className={accent ? `accent-${accent}` : undefined}>{value}</strong>
      {sub ? <p>{sub}</p> : null}
    </article>
  )
}

function Segmented<T extends string>({
  active,
  onChange,
  options,
}: {
  active: T
  onChange: (value: T) => void
  options: Array<{ key: T; label: string; count?: number }>
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          className={active === option.key ? 'selected' : ''}
          key={option.key}
          onClick={() => onChange(option.key)}
          type="button"
        >
          {option.label}
          {option.count !== undefined ? <span>{option.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

function SellerSelect({
  hideAbrazandoCuentos = false,
  onChange,
  value,
}: {
  hideAbrazandoCuentos?: boolean
  onChange: (seller: string) => void
  value: string
}) {
  const sellers = hideAbrazandoCuentos ? SOCIA_SELLERS : ([...SOCIA_SELLERS, 'Abrazandocuentos'] as const)

  return (
    <select aria-label="Vendedor" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Vendedor</option>
      {sellers.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  )
}

function DeliveryStatusToggle({
  delivered,
  disabled,
  onSelectDelivered,
}: {
  delivered: boolean
  disabled: boolean
  onSelectDelivered: (delivered: boolean) => void
}) {
  return (
    <div
      aria-label="Estado de entrega"
      className={`delivery-status-toggle ${delivered ? 'is-delivered' : 'is-pending'}`}
      role="group"
    >
      <button
        aria-pressed={!delivered}
        className={delivered ? undefined : 'active'}
        disabled={disabled}
        onClick={() => onSelectDelivered(false)}
        type="button"
      >
        Por entregar
      </button>
      <button
        aria-pressed={delivered}
        className={delivered ? 'active' : undefined}
        disabled={disabled}
        onClick={() => onSelectDelivered(true)}
        type="button"
      >
        Entregado
      </button>
    </div>
  )
}

function TabBar({ active, onChange }: { active: AppTab; onChange: (tab: AppTab) => void }) {
  const tabs: Array<{ key: AppTab; label: string; icon: IconName }> = [
    { key: 'home', label: 'Inicio', icon: 'home' },
    { key: 'ventas', label: 'Ventas', icon: 'bag' },
    { key: 'encargos', label: 'Encargos', icon: 'package' },
    { key: 'gastos', label: 'Gastos', icon: 'person' },
    { key: 'promo', label: 'Promos', icon: 'chart' },
  ]

  return (
    <nav className="tab-bar" aria-label="Navegación principal">
      {tabs.map((tab) => (
        <button
          className={active === tab.key ? 'active' : ''}
          key={tab.key}
          onClick={() => {
            onChange(tab.key)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          type="button"
        >
          <Icon name={tab.icon} />
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const [a, b] = colorFor(name)

  return (
    <span
      className="avatar"
      style={{
        background: `linear-gradient(135deg, ${a}, ${b})`,
        fontSize: size * 0.36,
        height: size,
        width: size,
      }}
    >
      {initials(name)}
    </span>
  )
}

function DeliveryIndicator({
  delivered,
  disabled,
  onClick,
}: {
  delivered: boolean
  disabled: boolean
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      aria-label={delivered ? 'Marcar venta como no entregada' : 'Marcar venta como entregada'}
      className={delivered ? 'delivery-indicator delivered' : 'delivery-indicator pending'}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {delivered ? '✓' : '×'}
    </button>
  )
}

function InvoiceIcon({ status }: { status: NonNullable<Sale['invoiceStatus']> }) {
  const docPaths = (
    <>
      <path d="M6 3h12v18l-2-1.2L14 21l-2-1.2L10 21l-2-1.2L6 21V3Z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </>
  )

  if (status === 'no_aplica') {
    return (
      <span className="invoice-icon no_aplica" title={invoiceStatusLabel(status)}>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          {docPaths}
          <path className="invoice-icon-slash" d="M5 5l14 14" fill="none" />
        </svg>
      </span>
    )
  }

  return (
    <span className={`invoice-icon ${status}`} title={invoiceStatusLabel(status)}>
      <svg aria-hidden="true" viewBox="0 0 24 24">
        {docPaths}
      </svg>
    </span>
  )
}

function invoiceStatusLabel(status: NonNullable<Sale['invoiceStatus']>) {
  if (status === 'facturado') return 'Facturado'
  if (status === 'pendiente') return 'Pendiente'
  return 'No se factura'
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="section-title">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
    </div>
  )
}

function StatusPill({ kind }: { kind: 'pagado' | 'parcial' | 'pendiente' }) {
  return (
    <span className={`status-pill ${kind}`}>
      {kind === 'pagado' ? 'Pagado' : kind === 'parcial' ? 'Parcial' : 'Por pagar'}
    </span>
  )
}

function ListGroup({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="sheet-list-section">
      <h3>{title}</h3>
      <div className="sheet-list">{children}</div>
    </section>
  )
}

function ListItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="sheet-list-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function PayerChip({ name }: { name: string }) {
  return <span className={`payer-chip payer-${name.toLowerCase()}`}>{name}</span>
}

type IconName = 'search' | 'chart' | 'home' | 'bag' | 'person' | 'package' | 'chevron-down'

function Icon({ name }: { name: IconName }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
    chart: <><path d="M3 3v18h18" /><path d="M7 14l4-4 4 4 5-6" /></>,
    home: <><path d="M3 12 12 3l9 9" /><path d="M5 10v10h14V10" /></>,
    bag: <><path d="M6 8h12l-1 13H7L6 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
    person: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    'chevron-down': <path d="m6 9 6 6 6-6" />,
    package: (
      <>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline fill="none" points="3.27 6.96 12 12.01 20.73 6.96" />
        <line fill="none" x1="12" x2="12" y1="22.08" y2="12" />
      </>
    ),
  }

  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" className="copy-icon" viewBox="0 0 24 24">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function getSaleTotal(sale: Sale) {
  return (sale.quantity ?? 0) * (sale.unitPriceArs ?? 0)
}

function getSalePending(sale: Sale) {
  const total = getSaleTotal(sale)

  if (total === 0 && sale.paidArs === 0) return 0

  return total - sale.paidArs
}

function isSalePending(sale: Sale) {
  if (sale.quantity === null || sale.unitPriceArs === null) return true

  return getSalePending(sale) > 0
}

function getSaleStatus(sale: Sale): 'pagado' | 'parcial' | 'pendiente' {
  if (sale.quantity === null || sale.unitPriceArs === null) return 'pendiente'

  const pending = getSalePending(sale)

  if (pending <= 0) return 'pagado'
  return sale.paidArs > 0 ? 'parcial' : 'pendiente'
}

function isDelivered(sale: Sale) {
  return (sale.delivered ?? '').trim().toLowerCase() === 'si'
}

/** Facturación pendiente (no incluye «no se factura» ni ya facturadas). */
function isInvoicePending(sale: Sale): boolean {
  return (sale.invoiceStatus ?? 'pendiente') === 'pendiente'
}

/** Pendiente de entrega y de cobro (figura solo en Encargos, no en la lista principal de Ventas). */
function isEncargoSale(sale: Sale) {
  return !isDelivered(sale) && isSalePending(sale)
}

function formatCompact(value: number) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1).replace('.', ',')}M`
  if (value >= 1000) return `$${Math.round(value / 1000)}K`
  return currencyArsFormatter.format(value)
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function colorFor(name: string) {
  const colors = [
    ['#ff9500', '#ffcc80'],
    ['#ff2d55', '#ff6482'],
    ['#af52de', '#d4a0f0'],
    ['#5856d6', '#9694e8'],
    ['#007aff', '#5ac8fa'],
    ['#34c759', '#7dd58a'],
    ['#00c7be', '#5dddd6'],
  ]
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0

  return colors[hash % colors.length]
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = getKey(item)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }

  return Array.from(groups.entries())
}

const EXPENSE_MONTH_INDEX: Record<string, number> = {
  Enero: 1,
  Febrero: 2,
  Marzo: 3,
  Abril: 4,
  Mayo: 5,
  Junio: 6,
  Julio: 7,
  Agosto: 8,
  Septiembre: 9,
  Octubre: 10,
  Noviembre: 11,
  Diciembre: 12,
}

function expenseMonthIndex(month: string): number {
  return EXPENSE_MONTH_INDEX[month] ?? 0
}

function compareExpensesNewestFirst(a: Expense, b: Expense, indexByExpense: Map<Expense, number>): number {
  if (b.year !== a.year) return b.year - a.year
  const monthDelta = expenseMonthIndex(b.month) - expenseMonthIndex(a.month)
  if (monthDelta !== 0) return monthDelta

  return (indexByExpense.get(b) ?? 0) - (indexByExpense.get(a) ?? 0)
}

function getTabFromLocation(): AppTab {
  const route = window.location.pathname
    .replace(appBasePath, '')
    .replace(/^\/+|\/+$/g, '')

  return tabByRoute[route] ?? 'home'
}

function getPathForTab(tab: AppTab) {
  const route = tabRoutes[tab]
  const base = appBasePath.endsWith('/') ? appBasePath : `${appBasePath}/`

  return route ? `${base}${route}` : base
}

function saleToDraft(sale: Sale): SaleDraft {
  return {
    buyer: sale.buyer,
    seller: sale.seller ?? '',
    quantity: sale.quantity?.toString() ?? '',
    unitPriceArs: sale.unitPriceArs?.toString() ?? '',
    paidArs: sale.paidArs.toString(),
    paymentMethod: sale.paymentMethod,
    paymentStatus: sale.paymentStatus,
    invoiceStatus: sale.invoiceStatus ?? 'pendiente',
    delivered: sale.delivered ?? '',
    billingNotes: sale.billingNotes ?? '',
  }
}

function createEmptySaleDraft(): SaleDraft {
  return {
    buyer: '',
    seller: 'Delfi',
    quantity: '',
    unitPriceArs: '15000',
    paidArs: '',
    paymentMethod: 'transferencia',
    paymentStatus: 'pendiente',
    invoiceStatus: 'pendiente',
    delivered: 'NO',
    billingNotes: '',
  }
}

function createEmptyPromoDraft(): PromoDraft {
  return {
    nombre: '',
    unidades: '',
    group: 'colaboracion',
    entregado: 'NO',
    entregadoPor: 'Delfi',
  }
}

function createEmptyExpenseDraft(): ExpenseDraft {
  return {
    concept: '',
    pesos: '',
    rate: '',
    usd: '',
    payer: 'Susan',
  }
}

function createStockAllocationDraft(allocations: StockAllocation[]): StockAllocationDraft {
  return allocations.reduce<StockAllocationDraft>((draft, allocation) => {
    draft[allocation.name] = {
      copies: allocation.copies.toString(),
      boxes: allocation.boxes.toString(),
    }

    return draft
  }, {})
}

function cobradoPaidValidationError(draft: SaleDraft): string | null {
  if (draft.paymentStatus !== 'cobrado') return null

  const trimmed = draft.paidArs.trim()
  if (trimmed === '') {
    return 'Si elegís Cobrado, completá el monto en Pagado (ARS).'
  }

  const paid = parseOptionalNumber(draft.paidArs)
  if (paid === null || paid <= 0) {
    return 'Si elegís Cobrado, ingresá un monto válido mayor a cero en Pagado (ARS).'
  }

  return null
}

function draftToSaleInput(draft: SaleDraft): SaleCreateInput {
  return {
    buyer: draft.buyer.trim(),
    seller: emptyToNull(draft.seller),
    quantity: parseOptionalNumber(draft.quantity),
    unitPriceArs: parseOptionalNumber(draft.unitPriceArs),
    paidArs: parseOptionalNumber(draft.paidArs) ?? 0,
    paymentMethod: draft.paymentMethod,
    paymentStatus: draft.paymentStatus,
    invoiceStatus: draft.invoiceStatus,
    delivered: emptyToNull(draft.delivered),
    billingNotes: emptyToNull(draft.billingNotes),
  }
}

function parseStockNumber(value: string | undefined) {
  const parsed = Number(value?.trim() ?? '')
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0
}

function formatDraftNumber(value: number) {
  if (!Number.isFinite(value)) return ''

  return Number(value.toFixed(2)).toString()
}

function getCurrentExpenseDate() {
  const date = new Date()
  const month = new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(date)

  return {
    month: month.charAt(0).toUpperCase() + month.slice(1),
    year: date.getFullYear(),
  }
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', '')
  textArea.style.position = 'fixed'
  textArea.style.left = '-9999px'
  document.body.appendChild(textArea)
  textArea.select()

  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(textArea)
  }
}

function emptyToNull(value: string) {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function parseOptionalNumber(value: string) {
  const normalized = value.trim().replace(',', '.')
  if (normalized === '') return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export default App
