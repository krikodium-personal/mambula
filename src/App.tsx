import './App.css'
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  computeAbrazandoGananciasFromUnits,
  computeAbrInventorySplit,
  computeVentasMambulaSplits,
  estimateArsPerUsdFromExpenseRates,
  liquidacionVentasRevenueArs,
  AC_STOCK_NAME,
  WONKY_ARS_PER_VENTA_COPY,
  type AbrInventorySplit,
} from './data/partnerSplits'
import CuentasMedioSettlementModal from './components/CuentasMedioSettlementModal'
import CuentasMedioTransactionsSheet from './components/CuentasMedioTransactionsSheet'
import LiquidacionesVentasCard from './components/LiquidacionesVentasCard'
import ProfitCard from './components/ProfitCard'
import {
  EncargosScreenSkeleton,
  GastosScreenSkeleton,
  HomeScreenSkeleton,
  PromocionalesScreenSkeleton,
  VentasScreenSkeleton,
} from './components/ScreenSkeletons'
import {
  computeCuentasMedioGrossFromSales,
  CUENTAS_SOCIAS,
  type CuentasMedioBalances,
  type CuentasSocia,
} from './lib/cuentasMedioBalances'
import type { CuentasSettlementComputeResult } from './lib/cuentasSettlementEngine'
import {
  applyCuentasOperationsToBalances,
  loadCuentasSettlementOperations,
  persistCuentasSettlement,
  persistWonkyCuentasSettlement,
  type CuentasSettlementOperation,
} from './lib/cuentasSettlementsRepository'
import type { CuentasPaymentSource } from './lib/cuentasPaymentSources'
import {
  breakdownInventoryMovement,
  inventoryCopiesFromBoxes,
  promoDeliveredUnitsForStockRow,
  parseStockNumber,
  deliveredUnitsAttributedToSeller,
  isSaleCobradoOrParcial,
  paidCopiesForSale,
  type InventoryMovementBreakdown,
} from './lib/inventoryProgress'
import { getSalePending, getSaleStatus, getSaleTotal } from './lib/saleFinancials'
import { loadPromoRows, savePromoRows, type PromoRowStored, type PromoRowsStored } from './lib/promocionalesStorage'
import { fetchPromoRowsFromSupabase, savePromoRowsRemote } from './lib/promocionalesRepository'
import { isSupabaseConfigured } from './lib/supabase'
import {
  createExpense,
  loadExpenses,
  type Expense,
} from './lib/expensesRepository'
import { createPartnerSettlement, loadPartnerSettlements } from './lib/partnerSettlementsRepository'
import {
  wonkyLiquidacionSaldadoArs,
  wonkyLiquidacionSettlements,
  wonkySettledCopiesFromSettlements,
} from './lib/wonkySettlement'
import {
  createSale,
  deleteAcSchemeSaleRecord,
  deleteSale,
  fallbackVentasData,
  formatUnknownError,
  insertAcSchemeSaleRecord,
  loadVentasData,
  totalAcSchemeSoldQuantity,
  updateInvoiceStatus,
  updateStockAllocations,
  updateSale,
  type SaleCreateInput,
  type SaleUpdateInput,
  type VentasData,
} from './lib/ventasRepository'
import type {
  AcSchemeSaleRecord,
  PartnerGainBreakdown,
  PartnerSettlement,
  Sale,
  SaleTransferDestination,
  SplitPartnerKey,
  StockAllocation,
} from './types'

function compareSaleDateDesc(a: Sale, b: Sale): number {
  return String(b.date).localeCompare(String(a.date))
}

/** Alias Mercado Pago para cobros a nombre de Mechi (distinto del alias principal en proyecto). */
const MECHI_MP_PAYMENT_ALIAS = 'mambula.cancion'

type AppTab = 'home' | 'ventas' | 'encargos' | 'promo' | 'gastos'
/** UI del modal de venta; se mapea a `paymentStatus` + `paidArs` al guardar. */
type SalePaymentTier = 'porPagar' | 'parcial' | 'pagado'
type SaleDraft = {
  buyer: string
  seller: string
  quantity: string
  unitPriceArs: string
  /** Monto abonado si `paymentTier === 'parcial'`. */
  partialPaidArs: string
  paymentMethod: Sale['paymentMethod']
  transferDestination: SaleTransferDestination
  paymentTier: SalePaymentTier
  invoiceStatus: NonNullable<Sale['invoiceStatus']>
  delivered: string
  billingNotes: string
}

/** Campo a resaltar cuando `edit-error` viene del guardado del borrador de venta. */
type SaleDraftErrorField = 'buyer' | 'quantity' | 'saleLine' | 'partialPaid' | 'paymentMethod'
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
const ventasShortDateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
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

function App() {
  const [tab, setTab] = useState<AppTab>(() => getTabFromLocation())
  const [ventasData, setVentasData] = useState<VentasData>(fallbackVentasData)
  const [partnerSettlements, setPartnerSettlements] = useState<PartnerSettlement[]>([])
  const [cuentasOperations, setCuentasOperations] = useState<CuentasSettlementOperation[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [expensesLoading, setExpensesLoading] = useState(isSupabaseConfigured)
  const [promoLoading, setPromoLoading] = useState(isSupabaseConfigured)
  const [partnerSettlementsLoading, setPartnerSettlementsLoading] = useState(isSupabaseConfigured)
  const [cuentasOperationsLoading, setCuentasOperationsLoading] = useState(isSupabaseConfigured)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [mechiCopyStatus, setMechiCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [saleDetailEncargoSummary, setSaleDetailEncargoSummary] = useState(false)
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null)
  const [saleDraft, setSaleDraft] = useState<SaleDraft | null>(null)
  const [savingSaleId, setSavingSaleId] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [saleDraftErrorField, setSaleDraftErrorField] = useState<SaleDraftErrorField | null>(null)
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
  const [promoRemoteSaveEnabled, setPromoRemoteSaveEnabled] = useState(() => !isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    setPromoLoading(true)

    void fetchPromoRowsFromSupabase(promoData as PromoRowsStored)
      .then((rows) => {
        if (!cancelled) {
          setPromoRows(rows)
        }
      })
      .catch(() => {
        /* mantener estado inicial (localStorage + defaults) */
      })
      .finally(() => {
        if (!cancelled) {
          setPromoRemoteSaveEnabled(true)
          setPromoLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    savePromoRows(promoRows)
    if (!promoRemoteSaveEnabled || !isSupabaseConfigured) return

    const timer = window.setTimeout(() => {
      void savePromoRowsRemote(promoRows).catch(() => {})
    }, 450)

    return () => window.clearTimeout(timer)
  }, [promoRows, promoRemoteSaveEnabled])

  useEffect(() => {
    let ignore = false

    async function fetchVentasData() {
      try {
        setLoading(true)
        const data = await loadVentasData()

        if (!ignore) {
          setVentasData(data)
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
    if (isSupabaseConfigured) {
      setExpensesLoading(true)
    }

    loadExpenses()
      .then((rows) => {
        if (!ignore) {
          setExpenses(rows)
        }
      })
      .catch(() => {
        if (!ignore) {
          setExpenses([])
        }
      })
      .finally(() => {
        if (!ignore && isSupabaseConfigured) {
          setExpensesLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false
    if (isSupabaseConfigured) {
      setPartnerSettlementsLoading(true)
    }

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
      .finally(() => {
        if (!ignore && isSupabaseConfigured) {
          setPartnerSettlementsLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false
    if (isSupabaseConfigured) {
      setCuentasOperationsLoading(true)
    }

    loadCuentasSettlementOperations()
      .then((rows) => {
        if (!ignore) setCuentasOperations(rows)
      })
      .catch(() => {
        if (!ignore) setCuentasOperations([])
      })
      .finally(() => {
        if (!ignore && isSupabaseConfigured) {
          setCuentasOperationsLoading(false)
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
  const soldCopies = sales.reduce((total, sale) => total + (sale.quantity ?? 0), 0)
  const paidSoldCopies = useMemo(() => sales.reduce((sum, s) => sum + paidCopiesForSale(s), 0), [sales])

  /** Suma `paid_ars`: todas las ventas cargadas (tras paginar la tabla `sales` en Supabase). */
  const salesPaidArsTotal = useMemo(() => sales.reduce((sum, sale) => sum + sale.paidArs, 0), [sales])

  const ventasTabSales = useMemo(() => sales.filter((sale) => !isEncargoSale(sale)), [sales])

  const ventasLiquidacionScopedSales = useMemo(
    () =>
      ventasTabSales.filter((s) => s.paymentStatus === 'cobrado' || s.paymentStatus === 'parcial'),
    [ventasTabSales],
  )

  const ventasLiquidacionTotalArs = useMemo(
    () =>
      ventasLiquidacionScopedSales.reduce((sum, s) => sum + liquidacionVentasRevenueArs(s), 0),
    [ventasLiquidacionScopedSales],
  )

  const encargoSales = useMemo(() => sales.filter(isEncargoSale), [sales])
  const ventasTabPaidArs = ventasTabSales.reduce((total, sale) => total + sale.paidArs, 0)
  const ventasTabPendingArs = useMemo(
    () => ventasTabSales.reduce((sum, sale) => sum + Math.max(0, getSalePending(sale)), 0),
    [ventasTabSales],
  )

  const abrSplit = useMemo(() => {
    const copiesPerBox = projectConfig.firstPrintRun.copies / projectConfig.firstPrintRun.boxes
    return computeAbrInventorySplit(stockAllocations, projectConfig.costRules, undefined, copiesPerBox)
  }, [stockAllocations, projectConfig.costRules, projectConfig.firstPrintRun.boxes, projectConfig.firstPrintRun.copies])

  const acSchemeSoldQuantityRaw = useMemo(() => {
    const raw = totalAcSchemeSoldQuantity(ventasData)
    return Math.max(0, raw)
  }, [ventasData.acSchemeSales, ventasData.acSchemeSoldUnits])

  async function handleAcSchemeSaleSubmit(input: { quantity: number; soldAt: string }) {
    const row = await insertAcSchemeSaleRecord(input)
    setVentasData((current) => ({
      ...current,
      acSchemeSales: [row, ...current.acSchemeSales],
      acSchemeSoldUnits: null,
    }))
  }

  async function handleAcSchemeSaleDelete(id: string) {
    await deleteAcSchemeSaleRecord(id)
    setVentasData((current) => ({
      ...current,
      acSchemeSales: current.acSchemeSales.filter((r) => r.id !== id),
    }))
  }

  const partnerGainRows = useMemo(
    () => computeVentasMambulaSplits(ventasLiquidacionTotalArs, paidSoldCopies),
    [ventasLiquidacionTotalArs, paidSoldCopies],
  )

  async function saveWonkyEjemplaresSettlement(
    input: {
      copies: number
      settledOn: string
      amountArs: number
      source: CuentasPaymentSource
    },
    balancesBefore: CuentasMedioBalances,
  ) {
    const op = await persistWonkyCuentasSettlement(
      input.settledOn,
      {
        copies: input.copies,
        amountArs: input.amountArs,
        source: input.source,
      },
      balancesBefore,
    )
    const row = await createPartnerSettlement({
      partner: 'Wonky',
      amountArs: input.amountArs,
      settledOn: input.settledOn,
      scope: String(input.copies),
      operationId: op.id,
    })
    setCuentasOperations((current) => [op, ...current])
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

  async function copyMechiPaymentAlias() {
    setMechiCopyStatus('copied')
    window.setTimeout(() => setMechiCopyStatus('idle'), 1400)

    try {
      await copyTextToClipboard(MECHI_MP_PAYMENT_ALIAS)
    } catch {
      setMechiCopyStatus('error')
      window.setTimeout(() => setMechiCopyStatus('idle'), 1400)
    }
  }

  function startEditingSale(sale: Sale) {
    setCreateDraft(null)
    setSaleDraftPresentation('default')
    setEditingSaleId(sale.id)
    setEditError(null)
    setSaleDraftErrorField(null)
    setSaleDraft(saleToDraft(sale))
  }

  function openEncargoVenderSheet(sale: Sale) {
    setCreateDraft(null)
    setEditError(null)
    setSaleDraftErrorField(null)
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
    setSaleDraftErrorField(null)
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

  function handleOpenSaleFromCuentas(sale: Sale) {
    if (isEncargoSale(sale)) {
      setSaleDetailEncargoSummary(true)
      setSelectedSale(sale)
      selectTab('encargos')
    } else {
      setSaleDetailEncargoSummary(false)
      setSelectedSale(sale)
      selectTab('ventas')
    }
  }

  async function saveEditingSale(saleId: string) {
    if (!saleDraft) return

    if (!saleDraft.buyer.trim()) {
      setEditError('Completá el nombre del comprador.')
      setSaleDraftErrorField('buyer')
      return
    }

    const baselineSale = ventasData.sales.find((s) => s.id === saleId)
    const deliveredSi = (saleDraft.delivered ?? '').trim().toLowerCase() === 'si'
    const encargoOpts = {
      undeliveredEncargoBucket:
        !deliveredSi &&
        (baselineSale?.paymentStatus === 'encargo' ||
          Boolean(
            saleDetailEncargoSummary &&
              baselineSale &&
              !isDelivered(baselineSale) &&
              isSalePending(baselineSale),
          )),
    }

    const resolvedPayment = draftResolveSalePayment(saleDraft, encargoOpts)
    if (!resolvedPayment.ok) {
      setEditError(resolvedPayment.error)
      setSaleDraftErrorField(resolvedPayment.field)
      return
    }

    const pagadoMedioErr = pagadoPaymentMethodValidationError(saleDraft)
    if (pagadoMedioErr) {
      setEditError(pagadoMedioErr)
      setSaleDraftErrorField('paymentMethod')
      return
    }

    const otroMedioErr = otroPaymentMethodValidationError(saleDraft)
    if (otroMedioErr) {
      setEditError(otroMedioErr)
      setSaleDraftErrorField('paymentMethod')
      return
    }

    const input: SaleUpdateInput = {
      id: saleId,
      buyer: saleDraft.buyer.trim(),
      seller: emptyToNull(saleDraft.seller),
      quantity: parseOptionalNumber(saleDraft.quantity),
      unitPriceArs: parseOptionalNumber(saleDraft.unitPriceArs),
      paidArs: resolvedPayment.paidArs,
      paymentMethod: saleDraft.paymentMethod,
      transferDestination:
        saleDraft.paymentMethod === 'transferencia' ? saleDraft.transferDestination : null,
      paymentStatus: resolvedPayment.paymentStatus,
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
      setSaleDraftErrorField(null)
    } finally {
      setSavingSaleId(null)
    }
  }

  function handleCreateSale() {
    setEditError(null)
    setSaleDraftErrorField(null)
    cancelEditingSale()
    setNewSaleSheetVariant(tab === 'encargos' ? 'encargo' : 'venta')
    setCreateDraft(createEmptySaleDraft())
  }

  async function saveNewSale() {
    if (!createDraft) return

    if (!createDraft.buyer.trim()) {
      setEditError('Completá el nombre del comprador.')
      setSaleDraftErrorField('buyer')
      return
    }

    if (newSaleSheetVariant === 'encargo') {
      const qty = parseOptionalNumber(createDraft.quantity)
      if (qty === null || qty <= 0) {
        setEditError('Completá la cantidad de unidades (mayor a cero).')
        setSaleDraftErrorField('quantity')
        return
      }
    }

    const encargoOpts = { undeliveredEncargoBucket: newSaleSheetVariant === 'encargo' }

    const resolvedPayment = draftResolveSalePayment(createDraft, encargoOpts)
    if (!resolvedPayment.ok) {
      setEditError(resolvedPayment.error)
      setSaleDraftErrorField(resolvedPayment.field)
      return
    }

    const pagadoMedioErr = pagadoPaymentMethodValidationError(createDraft)
    if (pagadoMedioErr) {
      setEditError(pagadoMedioErr)
      setSaleDraftErrorField('paymentMethod')
      return
    }

    const otroMedioErr = otroPaymentMethodValidationError(createDraft)
    if (otroMedioErr) {
      setEditError(otroMedioErr)
      setSaleDraftErrorField('paymentMethod')
      return
    }

    const input = draftToSaleInput(createDraft, encargoOpts)

    try {
      setSavingNewSale(true)
      setEditError(null)
      setSaleDraftErrorField(null)
      const newSale = await createSale(input)

      setVentasData((current) => ({
        ...current,
        sales: [...current.sales, newSale],
      }))
      selectTab(isEncargoSale(newSale) ? 'encargos' : 'ventas')
      setCreateDraft(null)
      setSaleDetailEncargoSummary(isEncargoSale(newSale))
      setSelectedSale(newSale)
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'No se pudo crear la venta.')
      setSaleDraftErrorField(null)
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

    let nextPaymentStatus = sale.paymentStatus
    if (nextDelivered === 'SI') {
      if (sale.paymentStatus === 'encargo') {
        nextPaymentStatus = paymentStatusAfterDeliveredEncargo(sale)
      } else if (!isDelivered(sale) && isSalePending(sale)) {
        nextPaymentStatus = paymentStatusAfterDeliveredEncargo(sale)
      }
    }

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
        transferDestination:
          sale.paymentMethod === 'transferencia' ? sale.transferDestination : null,
        paymentStatus: nextPaymentStatus,
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

  const homeLoading =
    isSupabaseConfigured &&
    (loading || expensesLoading || partnerSettlementsLoading || cuentasOperationsLoading)

  return (
    <main className="ios-app">
      {tab === 'home' ? (
        <HomeScreen
          abrSplit={abrSplit}
          acSchemeSales={ventasData.acSchemeSales}
          acSchemeSoldQuantityRaw={acSchemeSoldQuantityRaw}
          copyMechiPaymentAlias={copyMechiPaymentAlias}
          copyPaymentAlias={copyPaymentAlias}
          copyStatus={copyStatus}
          mechiCopyStatus={mechiCopyStatus}
          expenses={expenses}
          salesPaidArsTotal={salesPaidArsTotal}
          loadError={loadError}
          loading={homeLoading}
          onAcSchemeSaleDelete={handleAcSchemeSaleDelete}
          onAcSchemeSaleSubmit={handleAcSchemeSaleSubmit}
          onOpenSaleFromCuentas={handleOpenSaleFromCuentas}
          cuentasOperations={cuentasOperations}
          onCuentasSettlementApplied={async (result, settledOn) => {
            const op = await persistCuentasSettlement(settledOn, result)
            setCuentasOperations((current) => [op, ...current])
            const settlements = await loadPartnerSettlements()
            setPartnerSettlements(settlements)
          }}
          partnerGainRows={partnerGainRows}
          partnerSettlements={partnerSettlements}
          onWonkyEjemplaresSettlement={saveWonkyEjemplaresSettlement}
          projectConfig={projectConfig}
          saveStockAllocationChanges={saveStockAllocationChanges}
          savingStockAllocations={savingStockAllocations}
          paidSoldCopies={paidSoldCopies}
          soldCopies={soldCopies}
          promoRows={promoRows}
          sales={sales}
          stockAllocationError={stockAllocationError}
          stockAllocations={stockAllocations}
        />
      ) : null}
      {tab === 'ventas' ? (
        <VentasScreen
          loading={loading}
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
          loading={loading}
          sales={encargoSales}
          onSelectSale={handleSelectSaleFromEncargosList}
          onVenderEncargo={openEncargoVenderSheet}
        />
      ) : null}
      {tab === 'promo' ? (
        <PromocionalesScreen loading={promoLoading} promoRows={promoRows} setPromoRows={setPromoRows} />
      ) : null}
      {tab === 'gastos' ? (
        <GastosScreen expenses={expenses} loading={expensesLoading} setExpenses={setExpenses} />
      ) : null}

      {selectedSale && !saleEditSheetOpen ? (
        saleDetailEncargoSummary ? (
          <EncargoSummarySheet
            deleteSale={handleDeleteSale}
            deleting={deletingSaleId === selectedSale.id}
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
          errorField={saleDraftErrorField}
          mode="create"
          submitting={savingNewSale}
          createVariant={newSaleSheetVariant}
          onClose={() => {
            setCreateDraft(null)
            setEditError(null)
            setSaleDraftErrorField(null)
          }}
          onSubmit={saveNewSale}
          setDraft={setCreateDraft}
        />
      ) : null}

      {saleEditSheetOpen && selectedSale && editingSaleId && saleDraft ? (
        <SaleDraftSheet
          draft={saleDraft}
          editError={editError}
          errorField={saleDraftErrorField}
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

function AcSchemeVentasSheet({
  remainingQty,
  referenceUnitPriceArs,
  onClose,
  onSubmit,
}: {
  remainingQty: number
  referenceUnitPriceArs: number
  onClose: () => void
  onSubmit: (input: { quantity: number; soldAt: string }) => Promise<void>
}) {
  const [qtyStr, setQtyStr] = useState('')
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10))
  const [localError, setLocalError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    const parsed = parseOptionalNumber(qtyStr)
    if (parsed === null || parsed < 1) {
      setLocalError('Ingresá una cantidad entera mayor a cero.')
      return
    }

    if (!Number.isInteger(parsed)) {
      setLocalError('La cantidad debe ser un número entero.')
      return
    }

    if (parsed > remainingQty) {
      setLocalError(
        `En esta venta podés cargar hasta ${numberFormatter.format(remainingQty)} ejemplares.`,
      )
      return
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
      setLocalError('Elegí una fecha válida.')
      return
    }

    try {
      setSubmitting(true)
      setLocalError(null)
      await onSubmit({ quantity: parsed, soldAt: dateStr.trim().slice(0, 10) })
      onClose()
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'No se pudo guardar la venta.')
    } finally {
      setSubmitting(false)
    }
  }

  const previewParsed = parseOptionalNumber(qtyStr)
  const previewArs =
    previewParsed !== null && Number.isInteger(previewParsed) && previewParsed >= 1
      ? previewParsed * referenceUnitPriceArs
      : null

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <h2>Nueva venta</h2>
            <p className="muted-label">Abrazandocuentos · esquema AC</p>
          </div>
          <button aria-label="Cerrar" className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="new-sale-form">
          <p className="card-note">
            Se guarda un registro con el <strong>monto referencial</strong> (cantidad ×{' '}
            {currencyArsFormatter.format(referenceUnitPriceArs)}) y la <strong>fecha</strong>. Cupo
            restante para nuevas ventas: <strong>{numberFormatter.format(remainingQty)}</strong>{' '}
            ejemplares.
          </p>
          <div className="edit-grid">
            <label className="ac-scheme-sheet-qty-label">
              <span>Fecha de la venta</span>
              <input
                onChange={(event) => {
                  setDateStr(event.target.value)
                  setLocalError(null)
                }}
                type="date"
                value={dateStr}
              />
            </label>
            <label className="ac-scheme-sheet-qty-label">
              <span>Cantidad de ejemplares</span>
              <input
                inputMode="numeric"
                max={remainingQty}
                min={1}
                onBlur={() => {
                  if (!qtyStr.trim()) {
                    setQtyStr('')
                  }
                }}
                onChange={(event) => {
                  setQtyStr(event.target.value)
                  setLocalError(null)
                }}
                onFocus={(event) => {
                  setLocalError(null)
                  if (qtyStr.trim() === '0') {
                    setQtyStr('')
                  } else if (qtyStr.trim() !== '') {
                    event.currentTarget.select()
                  }
                }}
                placeholder={`máx. ${remainingQty}`}
                step={1}
                type="number"
                value={qtyStr}
              />
            </label>
          </div>
          {previewArs !== null ? (
            <p className="card-note">
              Monto referencial de esta venta:{' '}
              <strong>{currencyArsFormatter.format(previewArs)}</strong>
            </p>
          ) : null}
          {localError ? <p className="edit-error">{localError}</p> : null}
          <div className="edit-actions">
            <button className="secondary-button" disabled={submitting} onClick={onClose} type="button">
              Cancelar
            </button>
            <button
              className="primary-button"
              disabled={submitting || remainingQty <= 0}
              onClick={() => void handleSubmit()}
              type="button"
            >
              {submitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AcSchemeSalesListSheet({
  legacySoldTotal,
  onClose,
  onDeleteRecord,
  rows,
}: {
  legacySoldTotal: number
  onClose: () => void
  onDeleteRecord: (id: string) => Promise<void>
  rows: AcSchemeSaleRecord[]
}) {
  const [confirmRow, setConfirmRow] = useState<AcSchemeSaleRecord | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const byDate = String(b.soldAt).localeCompare(String(a.soldAt))
        if (byDate !== 0) return byDate

        return String(b.id).localeCompare(String(a.id))
      }),
    [rows],
  )
  const totalQty = sorted.reduce((sum, row) => sum + row.quantity, 0)
  const totalArs = sorted.reduce((sum, row) => sum + row.amountArs, 0)
  const countLabel = sorted.length === 1 ? '1 registro' : `${sorted.length} registros`

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="detail-sheet" onClick={(event) => event.stopPropagation()}>
          <div className="grabber" />
          <div className="sheet-head">
            <div>
              <h2>Ventas esquema AC</h2>
              <p className="muted-label">Abrazandocuentos · liquidación referencial</p>
            </div>
            <button aria-label="Cerrar" className="close-button" onClick={onClose} type="button">
              ×
            </button>
          </div>

          <div className="ac-scheme-sales-list-body">
            {sorted.length > 0 ? (
              <p className="ac-scheme-sales-list-summary">
                {countLabel} · {numberFormatter.format(totalQty)} ejemplares · Total referencial{' '}
                {currencyArsFormatter.format(totalArs)}
              </p>
            ) : (
              <p className="cuentas-empty">
                {legacySoldTotal > 0
                  ? `Hay ${numberFormatter.format(legacySoldTotal)} ejemplares contabilizados sin detalle por venta (dato anterior). Las nuevas cargas aparecen aquí.`
                  : 'Todavía no hay ventas registradas en este esquema.'}
              </p>
            )}
            {sorted.length > 0 ? (
              <ul className="ac-scheme-sales-detail-list">
                {sorted.map((row) => (
                  <li className="ac-scheme-sales-detail-row" key={row.id}>
                    <div className="ac-scheme-sales-detail-main">
                      <strong>
                        {ventasShortDateFormatter.format(new Date(`${row.soldAt}T12:00:00`))}
                      </strong>
                      <span className="ac-scheme-sales-detail-meta">
                        {row.quantity} {row.quantity === 1 ? 'ejemplar' : 'ejemplares'}
                      </span>
                    </div>
                    <div className="ac-scheme-sales-detail-trailing">
                      <strong className="ac-scheme-sales-detail-amount">
                        {currencyArsFormatter.format(row.amountArs)}
                      </strong>
                      <button
                        aria-label={`Eliminar venta del ${ventasShortDateFormatter.format(new Date(`${row.soldAt}T12:00:00`))}`}
                        className="ac-scheme-sales-delete"
                        disabled={deleting}
                        onClick={(event) => {
                          event.stopPropagation()
                          setDeleteError(null)
                          setConfirmRow(row)
                        }}
                        type="button"
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      {confirmRow ? (
        <div
          aria-labelledby="ac-scheme-delete-title"
          aria-modal="true"
          className="nested-confirm-backdrop"
          role="dialog"
          onClick={() => {
            if (!deleting) {
              setConfirmRow(null)
              setDeleteError(null)
            }
          }}
        >
          <div className="nested-confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <h3 className="nested-confirm-title" id="ac-scheme-delete-title">
              ¿Eliminar este registro?
            </h3>
            <p className="nested-confirm-body">
              Se va a quitar la venta del{' '}
              <strong>
                {ventasShortDateFormatter.format(new Date(`${confirmRow.soldAt}T12:00:00`))}
              </strong>{' '}
              ({confirmRow.quantity} {confirmRow.quantity === 1 ? 'ejemplar' : 'ejemplares'}, referencial{' '}
              {currencyArsFormatter.format(confirmRow.amountArs)}). Esta acción no se puede deshacer.
            </p>
            {deleteError ? <p className="edit-error nested-confirm-error">{deleteError}</p> : null}
            <div className="nested-confirm-actions">
              <button
                className="secondary-button"
                disabled={deleting}
                onClick={() => {
                  setConfirmRow(null)
                  setDeleteError(null)
                }}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="primary-button red"
                disabled={deleting}
                onClick={() => {
                  void (async () => {
                    setDeleting(true)
                    setDeleteError(null)
                    try {
                      await onDeleteRecord(confirmRow.id)
                      setConfirmRow(null)
                    } catch (error) {
                      setDeleteError(formatUnknownError(error))
                    } finally {
                      setDeleting(false)
                    }
                  })()
                }}
                type="button"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function formatSharePercent(share: number): string {
  return `${Math.round(share * 100)}%`
}

function AbrValoresSheet({
  abrSplit,
  onClose,
}: {
  abrSplit: AbrInventorySplit
  onClose: () => void
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <h2>Valores</h2>
            <p className="muted-label">Parámetros · ABRAZANDOCUENTOS</p>
          </div>
          <button aria-label="Cerrar" className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="ac-scheme-sales-list-body">
          <table className="dashboard-mini-table">
            <tbody>
              <tr>
                <td>% Abrazando cuentos</td>
                <td>{formatSharePercent(abrSplit.pctAbrazandoCuentos)}</td>
              </tr>
              <tr>
                <td>% Wonky</td>
                <td>{formatSharePercent(abrSplit.pctWonky)}</td>
              </tr>
              <tr>
                <td>% Socias (pool)</td>
                <td>{formatSharePercent(abrSplit.pctSociasPool)}</td>
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
  )
}

function InventoryStockBar({
  promo,
  remainder,
  delivered,
}: {
  promo: number
  remainder: number
  delivered: number
}) {
  const total = promo + delivered + remainder
  if (total <= 0) {
    return <div className="progress-track inventory-stock-bar tall empty" aria-hidden="true" />
  }

  return (
    <div className="progress-track inventory-stock-bar tall" aria-hidden="true">
      {promo > 0 ? <div className="inventory-stock-segment promo" style={{ flex: promo }} /> : null}
      {delivered > 0 ? <div className="inventory-stock-segment delivered" style={{ flex: delivered }} /> : null}
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
          <span className="inventory-stock-count-dot delivered" />
          <span className="inventory-stock-count-label">Entregados</span>
          <span className="inventory-stock-count-value">{numberFormatter.format(movement.delivered)}</span>
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
        <span className="inventory-stock-count-dot delivered" />
        <span className="inventory-stock-count-label">Entregados</span>
        <span className="inventory-stock-count-value">{numberFormatter.format(movement.delivered)}</span>
      </div>
      <div className="inventory-stock-count-cell">
        <span className="inventory-stock-count-dot remainder" />
        <span className="inventory-stock-count-label">stock</span>
        <span className="inventory-stock-count-value">{numberFormatter.format(movement.remainder)}</span>
      </div>
    </div>
  )
}

function CuentasMedioDetailSheet({
  onClose,
  onSelectSale,
  sales,
  title,
}: {
  onClose: () => void
  onSelectSale: (sale: Sale) => void
  sales: Sale[]
  title: string
}) {
  const sorted = useMemo(() => [...sales].sort(compareSaleDateDesc), [sales])
  const totalArs = useMemo(() => sorted.reduce((sum, sale) => sum + sale.paidArs, 0), [sorted])
  const countLabel = sorted.length === 1 ? '1 venta cobrada' : `${sorted.length} ventas cobradas`

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <h2>{title}</h2>
            <p>
              {countLabel} · Total {currencyArsFormatter.format(totalArs)}
            </p>
          </div>
          <button aria-label="Cerrar" className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="cuentas-detail-sheet-body">
          {sorted.length === 0 ? (
            <p className="cuentas-empty">No hay ventas en este concepto.</p>
          ) : (
            <ul className="cuentas-detail-list">
              {sorted.map((sale) => (
                <li className="cuentas-detail-row-wrap" key={sale.id}>
                  <button
                    aria-label={`Ver detalle: ${sale.buyer}`}
                    className="cuentas-detail-row-button"
                    onClick={() => onSelectSale(sale)}
                    type="button"
                  >
                    <div className="cuentas-detail-row-main">
                      <strong>{sale.buyer}</strong>
                      <span className="cuentas-detail-meta">
                        {ventasShortDateFormatter.format(new Date(sale.date))}
                        {sale.quantity != null ? (
                          <>
                            {' '}
                            · {sale.quantity} {sale.quantity === 1 ? 'unidad' : 'unidades'}
                          </>
                        ) : null}
                        {sale.paymentMethod === 'transferencia' && sale.seller ? (
                          <>
                            {' '}
                            · {sale.seller}
                          </>
                        ) : null}
                      </span>
                    </div>
                    <strong className="cuentas-detail-amount">{currencyArsFormatter.format(sale.paidArs)}</strong>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function HomeScreen({
  abrSplit,
  acSchemeSales,
  acSchemeSoldQuantityRaw,
  copyMechiPaymentAlias,
  copyPaymentAlias,
  copyStatus,
  expenses,
  loadError,
  loading,
  mechiCopyStatus,
  onAcSchemeSaleDelete,
  onAcSchemeSaleSubmit,
  cuentasOperations,
  onCuentasSettlementApplied,
  onOpenSaleFromCuentas,
  onWonkyEjemplaresSettlement,
  partnerGainRows,
  partnerSettlements,
  paidSoldCopies,
  salesPaidArsTotal,
  projectConfig,
  promoRows,
  sales,
  saveStockAllocationChanges,
  savingStockAllocations,
  soldCopies,
  stockAllocationError,
  stockAllocations,
}: {
  abrSplit: AbrInventorySplit
  acSchemeSales: AcSchemeSaleRecord[]
  /** Suma de registros del esquema AC (sin recortar al inventario). */
  acSchemeSoldQuantityRaw: number
  copyMechiPaymentAlias: () => void
  copyPaymentAlias: () => void
  copyStatus: 'idle' | 'copied' | 'error'
  expenses: Expense[]
  loadError: string | null
  loading: boolean
  mechiCopyStatus: 'idle' | 'copied' | 'error'
  onAcSchemeSaleDelete: (id: string) => Promise<void>
  onAcSchemeSaleSubmit: (input: { quantity: number; soldAt: string }) => Promise<void>
  cuentasOperations: CuentasSettlementOperation[]
  onCuentasSettlementApplied: (result: CuentasSettlementComputeResult, settledOn: string) => Promise<void>
  onOpenSaleFromCuentas: (sale: Sale) => void
  onWonkyEjemplaresSettlement: (
    input: {
      copies: number
      settledOn: string
      amountArs: number
      source: CuentasPaymentSource
    },
    balancesBefore: CuentasMedioBalances,
  ) => Promise<void>
  partnerGainRows: PartnerGainBreakdown[]
  partnerSettlements: PartnerSettlement[]
  /** Ejemplares con `payment_status` cobrado o parcial (todas las ventas); StatCard Vendidos. */
  paidSoldCopies: number
  salesPaidArsTotal: number
  projectConfig: VentasData['projectConfig']
  promoRows: PromoRowsStored
  sales: Sale[]
  saveStockAllocationChanges: (allocations: StockAllocation[]) => Promise<void>
  savingStockAllocations: boolean
  soldCopies: number
  stockAllocationError: string | null
  stockAllocations: VentasData['stockAllocations']
}) {
  const [acVentasSheetOpen, setAcVentasSheetOpen] = useState(false)
  const [acSalesListOpen, setAcSalesListOpen] = useState(false)
  const [abrValoresSheetOpen, setAbrValoresSheetOpen] = useState(false)
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
  const [cuentasMedioSheet, setCuentasMedioSheet] = useState<{ title: string; sales: Sale[] } | null>(null)
  const [cuentasSettleOpen, setCuentasSettleOpen] = useState(false)
  const [cuentasTxOpen, setCuentasTxOpen] = useState(false)
  const availableCopies = projectConfig.firstPrintRun.copies - soldCopies
  const copiesPerBox = projectConfig.firstPrintRun.copies / projectConfig.firstPrintRun.boxes
  /** Cajas no asignadas a destinos del Home (mismas filas que la tabla; sin Promocionales). Ejemplares = cajas × libros/caja. */
  const homeInventoryUnassignedStock = useMemo(() => {
    const sumAllocatedBoxes = inventoryTableRows.reduce((sum, item) => {
      const boxes = editingInventory
        ? parseStockNumber(stockDraft[item.name]?.boxes)
        : item.boxes
      return sum + boxes
    }, 0)
    const remainingBoxes = projectConfig.firstPrintRun.boxes - sumAllocatedBoxes
    const remainingCopies = remainingBoxes * copiesPerBox
    return { remainingBoxes, remainingCopies }
  }, [
    copiesPerBox,
    editingInventory,
    inventoryTableRows,
    projectConfig.firstPrintRun.boxes,
    stockDraft,
  ])
  const inventoryError = localStockError ?? stockAllocationError
  const acInventoryRow = inventoryTableRows.find((row) => row.name === AC_STOCK_NAME)
  const acBoxesStr = editingInventory
    ? stockDraft[AC_STOCK_NAME]?.boxes ?? ''
    : String(acInventoryRow?.boxes ?? 0)
  const acSchemeCapCopies = inventoryCopiesFromBoxes(acBoxesStr, copiesPerBox)
  const acSchemeCap = Math.max(0, acSchemeCapCopies)
  const effectiveAcSchemeUnits = Math.min(acSchemeSoldQuantityRaw, acSchemeCap)
  const acSchemeRemainingQty = Math.max(0, acSchemeCap - acSchemeSoldQuantityRaw)

  const acSliderGains = useMemo(
    () =>
      computeAbrazandoGananciasFromUnits(
        effectiveAcSchemeUnits,
        projectConfig.costRules,
        abrSplit.referenceUnitPriceArs,
      ),
    [abrSplit.referenceUnitPriceArs, effectiveAcSchemeUnits, projectConfig.costRules],
  )

  const wonkySaldadoArs = useMemo(
    () => wonkyLiquidacionSaldadoArs(partnerSettlements),
    [partnerSettlements],
  )

  const wonkyEjemplaresSaldados = useMemo(
    () => wonkySettledCopiesFromSettlements(partnerSettlements),
    [partnerSettlements],
  )

  const wonkyLiquidacionRows = useMemo(
    () => wonkyLiquidacionSettlements(partnerSettlements),
    [partnerSettlements],
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

  const cuentasMedioGross = useMemo(() => computeCuentasMedioGrossFromSales(sales), [sales])

  const cuentasBalances = useMemo(
    () =>
      applyCuentasOperationsToBalances(
        { efectivo: cuentasMedioGross.efectivo, banco: cuentasMedioGross.banco },
        cuentasOperations,
      ),
    [cuentasMedioGross, cuentasOperations],
  )

  /** Ventas cobradas por bucket (para detalle al tocar una fila). */
  const cuentasPorMedio = useMemo(() => {
    const efectivoSalesBySocia: Record<CuentasSocia, Sale[]> = {
      Delfi: [],
      Mechi: [],
      Susan: [],
    }
    const transferenciaSales = {
      Delfi: [] as Sale[],
      Mechi: [] as Sale[],
      sinDefinir: [] as Sale[],
    }

    for (const sale of sales) {
      if (sale.paymentStatus !== 'cobrado') continue

      if (sale.paymentMethod === 'efectivo') {
        const seller = sale.seller?.trim()
        if (seller === 'Delfi' || seller === 'Mechi' || seller === 'Susan') {
          efectivoSalesBySocia[seller].push(sale)
        }
      } else if (sale.paymentMethod === 'transferencia') {
        if (sale.transferDestination === 'Delfi') transferenciaSales.Delfi.push(sale)
        else if (sale.transferDestination === 'Mechi') transferenciaSales.Mechi.push(sale)
        else transferenciaSales.sinDefinir.push(sale)
      }
    }

    const efectivoRows = CUENTAS_SOCIAS.map((seller) => ({
      seller,
      amount: cuentasBalances.efectivo[seller],
      sales: efectivoSalesBySocia[seller],
    }))

    const transferencia = {
      Delfi: cuentasBalances.banco.Delfi,
      Mechi: cuentasBalances.banco.Mechi,
      sinDefinir: cuentasMedioGross.transferenciaSinDefinir,
    }

    const efectivoTotal = efectivoRows.reduce((sum, row) => sum + row.amount, 0)
    const transferenciaTotal = transferencia.Delfi + transferencia.Mechi + transferencia.sinDefinir

    return { efectivoRows, transferencia, transferenciaSales, efectivoTotal, transferenciaTotal }
  }, [cuentasBalances, cuentasMedioGross.transferenciaSinDefinir, sales])

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
    const nextAllocations = inventoryTableRows.map((allocation) => {
      const boxes = parseStockNumber(stockDraft[allocation.name]?.boxes)

      return {
        name: allocation.name,
        copies: inventoryCopiesFromBoxes(stockDraft[allocation.name]?.boxes, copiesPerBox),
        boxes,
      }
    })
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
          <span className="liquidaciones-ventas-eyebrow">MERCADOPAGO</span>
          <span className="muted-label alias-owner-label">Delfi:</span>
          <div className="alias-row">
            <strong>{projectConfig.payment.alias}</strong>
            <button
              aria-label="Copiar alias"
              className="small-icon-button"
              onClick={copyPaymentAlias}
              type="button"
            >
              {copyStatus === 'copied' ? '✓' : copyStatus === 'error' ? '!' : <CopyIcon />}
            </button>
          </div>

          <div className="alias-card-split" />

          <span className="muted-label alias-owner-label">Mechi:</span>
          <div className="alias-row">
            <strong>{MECHI_MP_PAYMENT_ALIAS}</strong>
            <button
              aria-label="Copiar alias de Mechi"
              className="small-icon-button"
              onClick={copyMechiPaymentAlias}
              type="button"
            >
              {mechiCopyStatus === 'copied' ? '✓' : mechiCopyStatus === 'error' ? '!' : <CopyIcon />}
            </button>
          </div>

          <span className="muted-label">Alias para transferencias de ventas</span>
        </div>

        {loading ? (
          <HomeScreenSkeleton />
        ) : (
          <>
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
          <StatCard label="Vendidos" sub={`${numberFormatter.format(availableCopies)} disponibles`} value={numberFormatter.format(paidSoldCopies)} />
          <StatCard label="Ingresos" sub="Suma pagados" value={currencyArsFormatter.format(salesPaidArsTotal)} />
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
          <div className="inventory-print-summary-row">
            <span className="soft-pill">
              {numberFormatter.format(projectConfig.firstPrintRun.copies)} libros ·{' '}
              {numberFormatter.format(projectConfig.firstPrintRun.boxes)} cajas
            </span>
            <span className="muted-label inventory-stock-remainder-total">
              Stock sin asignar{' '}
              <strong>
                {numberFormatter.format(homeInventoryUnassignedStock.remainingBoxes)} cajas ·{' '}
                {numberFormatter.format(homeInventoryUnassignedStock.remainingCopies)} ejemplares
              </strong>
            </span>
          </div>
          {inventoryError ? <p className="edit-error inventory-error">{inventoryError}</p> : null}
          <div className="inventory-table">
            <div className="inventory-head">
              <span>Destino</span>
              <span>Ejemplares</span>
              <span>Cajas</span>
            </div>
            {inventoryTableRows.map((item) => {
              const allocationCopies = editingInventory
                ? inventoryCopiesFromBoxes(stockDraft[item.name]?.boxes, copiesPerBox)
                : inventoryCopiesFromBoxes(String(item.boxes), copiesPerBox)

              const promoUnits = promoDeliveredUnitsForStockRow(promoRows, item.name)
              const deliveredUnits = deliveredUnitsAttributedToSeller(sales, item.name)
              const movement = breakdownInventoryMovement(allocationCopies, promoUnits, deliveredUnits, item.name)
              const isSociaRow = item.name === 'Delfi' || item.name === 'Mechi' || item.name === 'Susan'

              return (
                <div className="inventory-row" key={item.name}>
                  <div className="inventory-values">
                    <span>{item.name}</span>
                    {editingInventory ? (
                      <>
                        <span
                          className="inventory-ejemplares-derived"
                          title={`${numberFormatter.format(copiesPerBox)} ejemplares por caja`}
                        >
                          {numberFormatter.format(
                            inventoryCopiesFromBoxes(stockDraft[item.name]?.boxes, copiesPerBox),
                          )}
                        </span>
                        <input
                          inputMode="numeric"
                          value={stockDraft[item.name]?.boxes ?? ''}
                          onChange={(event) => {
                            const boxes = event.target.value
                            const copiesN = inventoryCopiesFromBoxes(boxes, copiesPerBox)

                            setStockDraft({
                              ...stockDraft,
                              [item.name]: {
                                copies: copiesN.toString(),
                                boxes,
                              },
                            })
                          }}
                        />
                      </>
                    ) : (
                      <>
                        <span>
                          {numberFormatter.format(
                            inventoryCopiesFromBoxes(String(item.boxes), copiesPerBox),
                          )}
                        </span>
                        <span>{numberFormatter.format(item.boxes)}</span>
                      </>
                    )}
                  </div>
                  <InventoryStockBar
                    promo={movement.promo}
                    remainder={movement.remainder}
                    delivered={movement.delivered}
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

        <div className="ios-card cuentas-card">
          <div className="cuentas-card-head">
            <SectionTitle eyebrow="CUENTAS" title="Totales por medio de pago" />
            <div className="cuentas-card-actions">
              <button className="row-edit-button" onClick={() => setCuentasSettleOpen(true)} type="button">
                Saldar cuenta
              </button>
              <button className="cuentas-card-link" onClick={() => setCuentasTxOpen(true)} type="button">
                Ver transacciones
              </button>
            </div>
          </div>
          <p className="cuentas-card-sub">
            Saldos disponibles tras ventas <strong>cobradas</strong> (efectivo por vendedora; transferencias por cuenta).
            Los saldos bajan al confirmar un saldo de cuenta.
          </p>

          <h4 className="cuentas-subsection-label">EFECTIVO</h4>
          <ul className="cuentas-rows">
            {cuentasPorMedio.efectivoRows.map(({ seller, amount, sales: bucketSales }) => (
              <li className="cuentas-row cuentas-row--tap" key={seller}>
                <button
                  className="cuentas-row-button"
                  disabled={bucketSales.length === 0}
                  onClick={() =>
                    setCuentasMedioSheet({
                      title: `Efectivo · ${seller}`,
                      sales: bucketSales,
                    })
                  }
                  type="button"
                >
                  <span>{seller}</span>
                  <strong>{currencyArsFormatter.format(amount)}</strong>
                </button>
              </li>
            ))}
          </ul>
          <div className="cuentas-subtotal">
            <span>Subtotal efectivo</span>
            <strong>{currencyArsFormatter.format(cuentasPorMedio.efectivoTotal)}</strong>
          </div>

          <h4 className="cuentas-subsection-label">TRANSFERENCIA</h4>
          <ul className="cuentas-rows">
            <li className="cuentas-row cuentas-row--tap">
              <button
                className="cuentas-row-button"
                disabled={cuentasPorMedio.transferenciaSales.Delfi.length === 0}
                onClick={() =>
                  setCuentasMedioSheet({
                    title: 'Transferencia · Delfi',
                    sales: cuentasPorMedio.transferenciaSales.Delfi,
                  })
                }
                type="button"
              >
                <span>Delfi</span>
                <strong>{currencyArsFormatter.format(cuentasPorMedio.transferencia.Delfi)}</strong>
              </button>
            </li>
            <li className="cuentas-row cuentas-row--tap">
              <button
                className="cuentas-row-button"
                disabled={cuentasPorMedio.transferenciaSales.Mechi.length === 0}
                onClick={() =>
                  setCuentasMedioSheet({
                    title: 'Transferencia · Mechi',
                    sales: cuentasPorMedio.transferenciaSales.Mechi,
                  })
                }
                type="button"
              >
                <span>Mechi</span>
                <strong>{currencyArsFormatter.format(cuentasPorMedio.transferencia.Mechi)}</strong>
              </button>
            </li>
            {cuentasPorMedio.transferencia.sinDefinir > 0 ? (
              <li className="cuentas-row cuentas-row--tap cuentas-row--warn">
                <button
                  className="cuentas-row-button cuentas-row-button--warn"
                  onClick={() =>
                    setCuentasMedioSheet({
                      title: 'Transferencia · Sin cuenta destino',
                      sales: cuentasPorMedio.transferenciaSales.sinDefinir,
                    })
                  }
                  type="button"
                >
                  <span>Sin cuenta destino</span>
                  <strong>{currencyArsFormatter.format(cuentasPorMedio.transferencia.sinDefinir)}</strong>
                </button>
              </li>
            ) : null}
          </ul>
          <div className="cuentas-subtotal">
            <span>Subtotal transferencias</span>
            <strong>{currencyArsFormatter.format(cuentasPorMedio.transferenciaTotal)}</strong>
          </div>
        </div>

        <LiquidacionesVentasCard
          cuentasBalances={cuentasBalances}
          cuentasOperations={cuentasOperations}
          formatArs={(n) => currencyArsFormatter.format(n)}
          formatDateTime={(iso) =>
            new Intl.DateTimeFormat('es-AR', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(iso))
          }
          saldadoArs={wonkySaldadoArs}
          ejemplaresSaldados={wonkyEjemplaresSaldados}
          ejemplaresVendidos={paidSoldCopies}
          wonkyPorEjemplarArs={WONKY_ARS_PER_VENTA_COPY}
          wonkySettlements={wonkyLiquidacionRows}
          onSettleEjemplares={(input) => onWonkyEjemplaresSettlement(input, cuentasBalances)}
        />

        <div className="ios-card dashboard-split-card">
          <div className="dashboard-split-card-head">
            <SectionTitle eyebrow="Liquidacion" title="ABRAZANDOCUENTOS" />
            <button
              className="row-edit-button"
              disabled={acSchemeRemainingQty <= 0 || acSchemeCap <= 0}
              onClick={() => setAcVentasSheetOpen(true)}
              title={
                acSchemeCap <= 0
                  ? 'Sin cupo en inventario AC'
                  : acSchemeRemainingQty <= 0
                    ? 'Ya se alcanzó el máximo de ejemplares del esquema'
                    : undefined
              }
              type="button"
            >
              Nueva venta
            </button>
          </div>

          <div className="ac-scheme-summary-block">
            <div className="ac-scheme-indicators">
              <span className="ac-scheme-indicator-group">
                <span className="ac-scheme-indicator-label">Vendidos</span>
                <span className="ac-scheme-indicator-value">
                  {numberFormatter.format(acSchemeSoldQuantityRaw)}
                </span>
              </span>
              <button
                className="ac-scheme-text-link"
                onClick={() => setAcSalesListOpen(true)}
                type="button"
              >
                Ver lista
              </button>
              <div className="ac-scheme-indicators-trailing">
                <span aria-hidden className="ac-scheme-indicator-sep">
                  ·
                </span>
                <span className="ac-scheme-indicator-group">
                  <span className="ac-scheme-indicator-label">Restante</span>
                  <span className="ac-scheme-indicator-value">
                    {numberFormatter.format(acSchemeRemainingQty)}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="liquidaciones-ventas-hero ac-ganancias-total-hero">
            <div className="liquidaciones-ventas-hero-label">Total ventas</div>
            <div className="liquidaciones-ventas-hero-bruto">
              {currencyArsFormatter.format(acSliderGains.poolGrossArs)}
            </div>
          </div>

          <h4 className="dashboard-ganancias-subtitle">
            <span>Ganancias:</span>
            <button
              className="ac-scheme-text-link dashboard-ganancias-valores-link"
              onClick={() => setAbrValoresSheetOpen(true)}
              type="button"
            >
              Valores
            </button>
          </h4>
          <table className="dashboard-mini-table">
            <tbody>
              <tr>
                <td>Ganancia Abrazando cuentos</td>
                <td>{currencyArsFormatter.format(acSliderGains.gananciaAbrazandoCuentosArs)}</td>
              </tr>
              <tr>
                <td>Ganancia Wonky (pool)</td>
                <td>{currencyArsFormatter.format(acSliderGains.gananciaWonkyArs)}</td>
              </tr>
              <tr className="dashboard-mini-table-tr--flush-next">
                <td>Ganancia socias</td>
                <td>{currencyArsFormatter.format(acSliderGains.poolSociasArs)}</td>
              </tr>
              <tr>
                <td>Cada socia</td>
                <td>{currencyArsFormatter.format(acSliderGains.gananciaPorSociaAcArs)}</td>
              </tr>
            </tbody>
          </table>
        </div>



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

          </>
        )}

        {cuentasMedioSheet ? (
          <CuentasMedioDetailSheet
            onClose={() => setCuentasMedioSheet(null)}
            onSelectSale={(sale) => {
              setCuentasMedioSheet(null)
              onOpenSaleFromCuentas(sale)
            }}
            sales={cuentasMedioSheet.sales}
            title={cuentasMedioSheet.title}
          />
        ) : null}

        {acVentasSheetOpen ? (
          <AcSchemeVentasSheet
            remainingQty={acSchemeRemainingQty}
            referenceUnitPriceArs={abrSplit.referenceUnitPriceArs}
            onClose={() => setAcVentasSheetOpen(false)}
            onSubmit={onAcSchemeSaleSubmit}
          />
        ) : null}

        {acSalesListOpen ? (
          <AcSchemeSalesListSheet
            legacySoldTotal={acSchemeSoldQuantityRaw}
            rows={acSchemeSales}
            onClose={() => setAcSalesListOpen(false)}
            onDeleteRecord={onAcSchemeSaleDelete}
          />
        ) : null}

        {abrValoresSheetOpen ? (
          <AbrValoresSheet abrSplit={abrSplit} onClose={() => setAbrValoresSheetOpen(false)} />
        ) : null}

        {cuentasSettleOpen ? (
          <CuentasMedioSettlementModal
            balances={cuentasBalances}
            formatArs={(value) => currencyArsFormatter.format(value)}
            onClose={() => setCuentasSettleOpen(false)}
            onConfirm={async (result, settledOn) => {
              await onCuentasSettlementApplied(result, settledOn)
              setCuentasSettleOpen(false)
            }}
          />
        ) : null}

        {cuentasTxOpen ? (
          <CuentasMedioTransactionsSheet
            formatArs={(value) => currencyArsFormatter.format(value)}
            formatDateTime={(iso) =>
              new Intl.DateTimeFormat('es-AR', {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(iso))
            }
            onClose={() => setCuentasTxOpen(false)}
            operations={cuentasOperations}
          />
        ) : null}
      </div>
    </section>
  )
}

type VentasStatusFilter = 'todas' | 'pendiente' | 'pagados' | 'porEntregar' | 'porFacturar'

type VentasFilterAxis = 'estado' | 'medio'

const VENTAS_PAYMENT_METHOD_LABELS: Record<NonNullable<Sale['paymentMethod']>, string> = {
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  otro: 'Otro',
}

function ventasPaymentMethodLabel(method: Sale['paymentMethod']): string {
  if (method === null || method === undefined) return 'Sin definir'

  return VENTAS_PAYMENT_METHOD_LABELS[method]
}

function VentasScreen({
  loading,
  paidSalesArs,
  pendingSalesArs,
  onSelectSale,
  onToggleDelivered,
  sales,
  togglingDeliveryId,
}: {
  loading: boolean
  paidSalesArs: number
  pendingSalesArs: number
  onSelectSale: (sale: Sale) => void
  onToggleDelivered: (sale: Sale) => void
  sales: Sale[]
  togglingDeliveryId: string | null
}) {
  const [filter, setFilter] = useState<VentasStatusFilter>('todas')
  const [paidViaFilter, setPaidViaFilter] = useState<Sale['paymentMethod'] | null>(null)
  const [ventasFilterAxis, setVentasFilterAxis] = useState<VentasFilterAxis>('estado')
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sellerFilter, setSellerFilter] = useState<string | null>(null)

  useEffect(() => {
    if (paidViaFilter !== 'otro') return
    setPaidViaFilter(null)
    setVentasFilterAxis('estado')
  }, [paidViaFilter])

  const sellerScopedSales = useMemo(() => {
    return sellerFilter ? sales.filter((sale) => sale.seller === sellerFilter) : sales
  }, [sales, sellerFilter])

  const filteredSales = useMemo(() => {
    return sellerScopedSales
      .filter((sale) => {
        let matchesAxis = true

        if (ventasFilterAxis === 'estado') {
          matchesAxis =
            filter === 'todas' ||
            (filter === 'pendiente' && isSalePending(sale)) ||
            (filter === 'pagados' && getSaleStatus(sale) === 'pagado') ||
            (filter === 'porEntregar' && !isDelivered(sale)) ||
            (filter === 'porFacturar' && isInvoicePending(sale))
        } else {
          matchesAxis =
            paidViaFilter !== null &&
            sale.paymentStatus === 'cobrado' &&
            sale.paymentMethod === paidViaFilter
        }

        const matchesQuery = sale.buyer.toLowerCase().includes(query.toLowerCase())

        return matchesAxis && matchesQuery
      })
      .sort(compareSaleDateDesc)
  }, [filter, paidViaFilter, query, sellerScopedSales, ventasFilterAxis])

  const pendingCount = sellerScopedSales.filter(isSalePending).length
  const deliveryCount = sellerScopedSales.filter((sale) => !isDelivered(sale)).length
  const invoicePendingCount = sellerScopedSales.filter(isInvoicePending).length
  const paidTransferenciaCount = sellerScopedSales.filter(
    (sale) => sale.paymentStatus === 'cobrado' && sale.paymentMethod === 'transferencia',
  ).length
  const paidEfectivoCount = sellerScopedSales.filter(
    (sale) => sale.paymentStatus === 'cobrado' && sale.paymentMethod === 'efectivo',
  ).length

  const pagadosCount = sellerScopedSales.filter((sale) => getSaleStatus(sale) === 'pagado').length

  const ventasFilterCounts = useMemo(
    () => ({
      todas: sellerScopedSales.length,
      pendiente: pendingCount,
      pagados: pagadosCount,
      porEntregar: deliveryCount,
      porFacturar: invoicePendingCount,
      paidTransferencia: paidTransferenciaCount,
      paidEfectivo: paidEfectivoCount,
    }),
    [
      deliveryCount,
      invoicePendingCount,
      pagadosCount,
      paidEfectivoCount,
      paidTransferenciaCount,
      pendingCount,
      sellerScopedSales.length,
    ],
  )

  const ventasAdvancedFiltersActive =
    ventasFilterAxis === 'medio' || (ventasFilterAxis === 'estado' && filter !== 'todas')

  const sellerTotals = useMemo(() => {
    return sellerNames
      .filter((seller) => seller !== AC_STOCK_NAME)
      .map((seller) => {
      const sellerSales = sales.filter(
        (sale) => sale.seller === seller && isSaleCobradoOrParcial(sale),
      )

      return {
        seller,
        count: sellerSales.length,
        copies: sellerSales.reduce((sum, sale) => sum + paidCopiesForSale(sale), 0),
        total: sellerSales.reduce((sum, sale) => sum + liquidacionVentasRevenueArs(sale), 0),
      }
    })
  }, [sales])

  return (
    <section className="screen">
      <ScreenHeader
        eyebrow="Mambula"
        title="Ventas"
        subtitle={`${sales.length} transacciones · Mayo 2026`}
        trailing={
          <span className="screen-header-trailing">
            <span className="screen-header-filter-button-wrap">
              <button
                aria-label={ventasAdvancedFiltersActive ? 'Filtrar (filtros activos)' : 'Filtrar'}
                className="screen-header-filter-button"
                onClick={() => setFilterSheetOpen(true)}
                type="button"
              >
                Filtrar
              </button>
              {ventasAdvancedFiltersActive ? (
                <span className="screen-header-filter-dot" aria-hidden="true" />
              ) : null}
            </span>
          </span>
        }
      />

      {loading ? (
        <VentasScreenSkeleton />
      ) : (
        <>
      <div className="search-box">
        <Icon name="search" />
        <input
          aria-label="Buscar consumidor"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar consumidor"
          value={query}
        />
        {query ? (
          <button
            aria-label="Borrar búsqueda"
            className="search-box-clear"
            onClick={() => setQuery('')}
            type="button"
          >
            <Icon name="close" />
          </button>
        ) : null}
      </div>

      <div className="stats-row stats-row--full-currency">
        <StatCard label="Total vendido" value={currencyArsFormatter.format(paidSalesArs + pendingSalesArs)} />
        <StatCard
          accent="green"
          aria-label="Mostrar solo ventas pagadas"
          label="Pagado"
          selected={ventasFilterAxis === 'estado' && filter === 'pagados'}
          value={currencyArsFormatter.format(paidSalesArs)}
          onClick={() => {
            if (ventasFilterAxis === 'estado' && filter === 'pagados') {
              setFilter('todas')
              return
            }
            setVentasFilterAxis('estado')
            setPaidViaFilter(null)
            setFilter('pagados')
          }}
        />
        <StatCard
          accent="orange"
          aria-label="Mostrar solo ventas por pagar"
          label="Por pagar"
          selected={ventasFilterAxis === 'estado' && filter === 'pendiente'}
          selectionRing="orange"
          value={currencyArsFormatter.format(pendingSalesArs)}
          onClick={() => {
            if (ventasFilterAxis === 'estado' && filter === 'pendiente') {
              setFilter('todas')
              return
            }
            setVentasFilterAxis('estado')
            setPaidViaFilter(null)
            setFilter('pendiente')
          }}
        />
      </div>

      <div className="seller-stats-block">
      <div className="seller-stats seller-stats--full-currency">
        {sellerTotals.map((item) => (
          <button
            className={sellerFilter === item.seller ? 'stat-card seller-stat selected' : 'stat-card seller-stat'}
            key={item.seller}
            onClick={() => {
              setSellerFilter((current) => (current === item.seller ? null : item.seller))
              setVentasFilterAxis('estado')
              setFilter('todas')
              setPaidViaFilter(null)
            }}
            type="button"
          >
            <span>{item.seller}</span>
            <strong>{currencyArsFormatter.format(item.total)}</strong>
            <p>
              {item.count} {item.count === 1 ? 'venta' : 'ventas'}
            </p>
            <p>
              {numberFormatter.format(item.copies)}{' '}
              {item.copies === 1 ? 'ejemplar' : 'ejemplares'}
            </p>
          </button>
        ))}
      </div>
      <p className="seller-stats-note">Se consideran solo ventas cobradas parcial o totalmente</p>
      </div>

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

      {filteredSales.length === 0 ? (
        <p className="empty-message">Sin resultados</p>
      ) : null}
        </>
      )}

      {filterSheetOpen ? (
        <VentasFilterSheet
          counts={ventasFilterCounts}
          filter={filter}
          filterAxis={ventasFilterAxis}
          onClose={() => setFilterSheetOpen(false)}
          onSelectEstado={(key) => {
            setVentasFilterAxis('estado')
            setFilter(key)
          }}
          onSelectMedio={(value) => {
            setVentasFilterAxis('medio')
            setPaidViaFilter(value)
          }}
          paidViaFilter={paidViaFilter}
        />
      ) : null}
    </section>
  )
}

function VentasFilterSheet({
  counts,
  filter,
  filterAxis,
  onClose,
  onSelectEstado,
  onSelectMedio,
  paidViaFilter,
}: {
  counts: {
    todas: number
    pendiente: number
    pagados: number
    porEntregar: number
    porFacturar: number
    paidTransferencia: number
    paidEfectivo: number
  }
  filter: VentasStatusFilter
  filterAxis: VentasFilterAxis
  onClose: () => void
  onSelectEstado: (value: VentasStatusFilter) => void
  onSelectMedio: (value: NonNullable<Sale['paymentMethod']>) => void
  paidViaFilter: Sale['paymentMethod'] | null
}) {
  const statusOptions: Array<{ key: VentasStatusFilter; label: string; count: number }> = [
    { key: 'todas', label: 'Todas', count: counts.todas },
    { key: 'pendiente', label: 'Por pagar', count: counts.pendiente },
    { key: 'pagados', label: 'Pagados', count: counts.pagados },
    { key: 'porEntregar', label: 'Por entregar', count: counts.porEntregar },
    { key: 'porFacturar', label: 'Por facturar', count: counts.porFacturar },
  ]

  const paidMedioOptions = [
    { key: 'transferencia' as const, label: VENTAS_PAYMENT_METHOD_LABELS.transferencia, count: counts.paidTransferencia },
    { key: 'efectivo' as const, label: VENTAS_PAYMENT_METHOD_LABELS.efectivo, count: counts.paidEfectivo },
  ]

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <h2>Filtrar ventas</h2>
            <p>Solo aplica un criterio a la vez: estado de la venta o medio de pago al cobrar.</p>
          </div>
          <button className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <section className="sheet-list-section">
          <h3 id="ventas-filter-estado-heading">Estado</h3>
          <div className="sheet-list" role="radiogroup" aria-labelledby="ventas-filter-estado-heading">
            {statusOptions.map((option) => {
              const selected = filterAxis === 'estado' && filter === option.key

              return (
                <button
                  aria-checked={selected}
                  className={`filter-sheet-row ${selected ? 'selected' : ''}`}
                  key={option.key}
                  onClick={() => onSelectEstado(option.key)}
                  role="radio"
                  type="button"
                >
                  <span className="filter-sheet-row-main">
                    <span className="filter-sheet-radio" aria-hidden="true">
                      <span className="filter-sheet-radio-dot" />
                    </span>
                    <span className="filter-sheet-row-label">{option.label}</span>
                  </span>
                  <span className="filter-sheet-row-count">{option.count}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="sheet-list-section">
          <h3 id="ventas-filter-medio-heading">Medio de pago</h3>
          <div className="sheet-list" role="radiogroup" aria-labelledby="ventas-filter-medio-heading">
            {paidMedioOptions.map(({ key, label, count }) => {
              const selected = filterAxis === 'medio' && paidViaFilter === key

              return (
                <button
                  aria-checked={selected}
                  className={`filter-sheet-row ${selected ? 'selected' : ''}`}
                  key={key}
                  onClick={() => onSelectMedio(key)}
                  role="radio"
                  type="button"
                >
                  <span className="filter-sheet-row-main">
                    <span className="filter-sheet-radio" aria-hidden="true">
                      <span className="filter-sheet-radio-dot" />
                    </span>
                    <span className="filter-sheet-row-label">{label}</span>
                  </span>
                  <span className="filter-sheet-row-count">{count}</span>
                </button>
              )
            })}
          </div>
        </section>

        <button className="primary-button full" onClick={onClose} type="button">
          Aplicar
        </button>
      </div>
    </div>
  )
}

function EncargosScreen({
  loading,
  onSelectSale,
  onVenderEncargo,
  sales,
}: {
  loading: boolean
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

    return sellerScopedSales
      .filter((sale) => sale.buyer.toLowerCase().includes(normalized))
      .sort(compareSaleDateDesc)
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

      {loading ? (
        <EncargosScreenSkeleton />
      ) : (
        <>
      <div className="search-box">
        <Icon name="search" />
        <input
          aria-label="Buscar consumidor"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar consumidor"
          value={query}
        />
        {query ? (
          <button
            aria-label="Borrar búsqueda"
            className="search-box-clear"
            onClick={() => setQuery('')}
            type="button"
          >
            <Icon name="close" />
          </button>
        ) : null}
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
        </>
      )}
    </section>
  )
}

function encargoQtyCircleClass(quantity: number | null | undefined): string {
  if (quantity === null || quantity === undefined || quantity <= 1) {
    return ''
  }
  if (quantity === 2) {
    return 'encargo-qty-2'
  }
  if (quantity === 3) {
    return 'encargo-qty-3'
  }
  if (quantity === 4) {
    return 'encargo-qty-4'
  }
  return 'encargo-qty-5plus'
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
          <span
            aria-label={qtyAria}
            className={`encargo-qty-circle ${encargoQtyCircleClass(sale.quantity)}`.trim()}
            title={qtyAria}
          >
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
          <div className="sale-row-amount-with-icon">
            <PaymentMethodIcon method={sale.paymentMethod} />
            <span className={pendingArs > 0 ? 'amount danger' : 'amount'}>
              {currencyArsFormatter.format(totalArs)}
            </span>
          </div>
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
  deleteSale,
  deleting,
  onClose,
  onVender,
  sale,
}: {
  deleteSale: (sale: Sale) => void
  deleting: boolean
  onClose: () => void
  onVender: (sale: Sale) => void
  sale: Sale
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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

          {confirmingDelete ? (
            <div className="delete-confirmation">
              <strong>¿Eliminar este encargo?</strong>
              <p>Se borrará el registro en Supabase. Esta acción no se puede deshacer.</p>
              <div className="delete-actions">
                <button className="secondary-button" onClick={() => setConfirmingDelete(false)} type="button">
                  Cancelar
                </button>
                <button className="danger-button" disabled={deleting} onClick={() => void deleteSale(sale)} type="button">
                  {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
              </div>
            </div>
          ) : (
            <button className="danger-link-button" onClick={() => setConfirmingDelete(true)} type="button">
              Eliminar encargo
            </button>
          )}
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
          <ListItem label="Medio de pago" value={ventasPaymentMethodLabel(sale.paymentMethod)} />
          {sale.paymentMethod === 'transferencia' ? (
            <ListItem label="Cuenta destino" value={sale.transferDestination ?? 'Sin registrar'} />
          ) : null}
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

const UNIT_PRICE_ARS_VALUES = [15000, 12500, 9750, 7500] as const

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
  errorField,
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
  errorField: SaleDraftErrorField | null
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

  const paymentMethodSegmentActive: 'transferencia' | 'efectivo' | null =
    draft.paymentMethod === 'transferencia' || draft.paymentMethod === 'efectivo'
      ? draft.paymentMethod
      : null

  const lineTotalArs = saleLineTotalArsDraft(draft)

  const highlightBuyer = errorField === 'buyer'
  const highlightQuantity = errorField === 'quantity' || errorField === 'saleLine'
  const highlightUnitPriceRow = errorField === 'saleLine'
  const highlightPartialPaid = errorField === 'partialPaid'
  const highlightPaymentMethod = errorField === 'paymentMethod'

  const inputCls = (highlight: boolean) =>
    highlight ? 'new-sale-input new-sale-input--error' : 'new-sale-input'

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
                aria-invalid={highlightBuyer}
                aria-labelledby="new-sale-buyer-label"
                className={inputCls(highlightBuyer)}
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
                  aria-invalid={highlightQuantity}
                  aria-labelledby="new-sale-qty-label"
                  className={inputCls(highlightQuantity)}
                  inputMode="numeric"
                  placeholder="0"
                  value={draft.quantity}
                  onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
                />
              </div>
            ) : (
              <>
                <div className="new-sale-field">
                  <span className="new-sale-field-label" id="new-sale-qty-label-full">
                    Unidades
                  </span>
                  <input
                    aria-invalid={highlightQuantity}
                    aria-labelledby="new-sale-qty-label-full"
                    className={inputCls(highlightQuantity)}
                    inputMode="numeric"
                    placeholder="0"
                    value={draft.quantity}
                    onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
                  />
                </div>

                <div className={`new-sale-field${highlightUnitPriceRow ? ' new-sale-field--error' : ''}`}>
                  <span className="new-sale-field-label">Precio unitario</span>
                  <Segmented<string>
                    active={unitPriceSegmentActive(draft.unitPriceArs)}
                    onChange={(key) => setDraft({ ...draft, unitPriceArs: unitPriceFromSegmentKey(key) })}
                    options={unitPriceSegmentOptions(draft.unitPriceArs)}
                  />
                  {lineTotalArs !== null ? (
                    <span className="new-sale-field-hint">
                      Total de la venta: {currencyArsFormatter.format(lineTotalArs)}
                    </span>
                  ) : null}
                </div>

                <div className="new-sale-field">
                  <span className="new-sale-field-label">Pago</span>
                  <Segmented<SalePaymentTier>
                    active={draft.paymentTier}
                    onChange={(paymentTier) =>
                      setDraft({
                        ...draft,
                        partialPaidArs: paymentTier === 'parcial' ? draft.partialPaidArs : '',
                        paymentMethod:
                          paymentTier !== 'pagado' ? null : draft.paymentMethod ?? 'transferencia',
                        paymentTier,
                      })
                    }
                    options={[
                      { key: 'porPagar', label: 'Por pagar' },
                      { key: 'parcial', label: 'Parcial' },
                      { key: 'pagado', label: 'Pagado' },
                    ]}
                  />
                </div>

                {draft.paymentTier === 'parcial' ? (
                  <div className="new-sale-field">
                    <span className="new-sale-field-label" id="new-sale-partial-paid-label">
                      Pagado:
                    </span>
                    <input
                      aria-invalid={highlightPartialPaid}
                      aria-labelledby="new-sale-partial-paid-label"
                      className={inputCls(highlightPartialPaid)}
                      inputMode="decimal"
                      placeholder="0"
                      value={draft.partialPaidArs}
                      onChange={(event) => setDraft({ ...draft, partialPaidArs: event.target.value })}
                    />
                    {lineTotalArs !== null ? (
                      <span className="new-sale-field-hint">
                        Menor que {currencyArsFormatter.format(lineTotalArs)}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className={`new-sale-field${highlightPaymentMethod ? ' new-sale-field--error' : ''}`}>
                  <span className="new-sale-field-label">Medio de pago</span>
                  <span className="new-sale-field-hint">
                    {draft.paymentTier === 'pagado'
                      ? 'Obligatorio cuando la venta está pagada.'
                      : 'Opcional si la venta no está totalmente pagada.'}
                  </span>
                  <Segmented<'transferencia' | 'efectivo'>
                    active={paymentMethodSegmentActive}
                    onChange={(paymentMethod) => {
                      if (
                        draft.paymentTier !== 'pagado' &&
                        (draft.paymentMethod === 'transferencia' ||
                          draft.paymentMethod === 'efectivo') &&
                        draft.paymentMethod === paymentMethod
                      ) {
                        setDraft({ ...draft, paymentMethod: null })
                        return
                      }
                      setDraft({ ...draft, paymentMethod })
                    }}
                    options={[
                      { key: 'transferencia', label: 'Transferencia' },
                      { key: 'efectivo', label: 'Efectivo' },
                    ]}
                  />
                </div>

                {draft.paymentMethod === 'transferencia' ? (
                  <div className="new-sale-field">
                    <span className="new-sale-field-label" id="new-sale-transfer-dest-label">
                      Cuenta destino
                    </span>
                    <Segmented<SaleTransferDestination>
                      active={draft.transferDestination}
                      onChange={(transferDestination) => setDraft({ ...draft, transferDestination })}
                      options={[
                        { key: 'Delfi', label: 'Delfi' },
                        { key: 'Mechi', label: 'Mechi' },
                      ]}
                    />
                  </div>
                ) : null}

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
  loading,
  promoRows,
  setPromoRows,
}: {
  loading: boolean
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

  function deletePromoEditRecord() {
    if (!promoEditTarget) return

    const { group, nombre } = promoEditTarget

    setPromoRows((current) => {
      const list = current[group]
      const idx = list.findIndex((item) => item.nombre === nombre)
      if (idx === -1) return current

      return {
        ...current,
        [group]: list.filter((_, i) => i !== idx),
      }
    })
    setPromoEditTarget(null)
  }

  return (
    <section className="screen">
      <ScreenHeader
        eyebrow="Mambula"
        title="Promocionales"
        subtitle="Ejemplares entregados al equipo, colaboradores, colegios e influencers."
      />
      {loading ? (
        <PromocionalesScreenSkeleton />
      ) : (
        <>
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
        </>
      )}
      {promoEditTarget && promoEditRow ? (
        <PromoEditSheet
          key={`${promoEditTarget.group}-${promoEditTarget.nombre}`}
          row={promoEditRow}
          onClose={() => setPromoEditTarget(null)}
          onDelete={deletePromoEditRecord}
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
  loading,
  setExpenses,
}: {
  expenses: Expense[]
  loading: boolean
  setExpenses: Dispatch<SetStateAction<Expense[]>>
}) {
  const [filter, setFilter] = useState('todos')
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft | null>(null)
  const [expenseError, setExpenseError] = useState<string | null>(null)
  const [savingExpense, setSavingExpense] = useState(false)
  const filtered = filter === 'todos' ? expenses : expenses.filter((item) => item.payer === filter)
  const sortedFiltered = useMemo(
    () => [...filtered].sort(compareExpensesNewestFirst),
    [filtered],
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
  const groups = useMemo((): Array<[string, Expense[]]> => {
    return groupBy(sortedFiltered, (item) => `${item.month} ${item.year}`).map(([month, rows]) => [
      month,
      sortExpensesWithinMonthGroup(rows),
    ])
  }, [sortedFiltered])

  async function saveExpense() {
    if (!expenseDraft || savingExpense) return

    const concept = expenseDraft.concept.trim()
    const usd = parseOptionalNumber(expenseDraft.usd) ?? 0

    if (!concept) {
      setExpenseError('Completá el concepto.')
      return
    }

    setSavingExpense(true)
    setExpenseError(null)

    try {
      const row = await createExpense({
        concept,
        pesos: parseOptionalNumber(expenseDraft.pesos),
        rate: parseOptionalNumber(expenseDraft.rate),
        usd,
        payer: expenseDraft.payer,
        ...getCurrentExpenseDate(),
      })
      setExpenses((current) => [row, ...current])
      setExpenseDraft(null)
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : 'No se pudo guardar el gasto.')
    } finally {
      setSavingExpense(false)
    }
  }

  return (
    <section className="screen">
      <ScreenHeader
        eyebrow="Mambula"
        title="Gastos"
        subtitle="Producción, honorarios, imprenta y costos asociados al proyecto."
      />
      {loading ? (
        <GastosScreenSkeleton />
      ) : (
        <>
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
              <div className={`expense-row ${index === rows.length - 1 ? 'last' : ''}`} key={item.id}>
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
        </>
      )}
      {expenseDraft ? (
        <NewExpenseSheet
          draft={expenseDraft}
          error={expenseError}
          onClose={() => {
            setExpenseDraft(null)
            setExpenseError(null)
          }}
          onSave={() => void saveExpense()}
          saving={savingExpense}
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
  onDelete,
  onSave,
  row,
}: {
  onClose: () => void
  onDelete: () => void
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
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  function handleSave() {
    const message = onSave(draft)
    if (message) {
      setError(message)

      return
    }

    setError(null)
    onClose()
  }

  function handleConfirmDelete() {
    onDelete()
    setConfirmDeleteOpen(false)
  }

  return (
    <>
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
            <div className="edit-actions promo-edit-actions">
              <button
                className="promo-edit-delete-button"
                onClick={() => setConfirmDeleteOpen(true)}
                type="button"
              >
                Eliminar
              </button>
              <div className="promo-edit-actions-trailing">
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
      </div>

      {confirmDeleteOpen ? (
        <div
          aria-labelledby="promo-delete-title"
          aria-modal="true"
          className="nested-confirm-backdrop"
          role="dialog"
          onClick={() => setConfirmDeleteOpen(false)}
        >
          <div className="nested-confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <h3 className="nested-confirm-title" id="promo-delete-title">
              ¿Eliminar registro?
            </h3>
            <p className="nested-confirm-body">
              Se va a quitar <strong>{row.nombre}</strong> de promocionales. Esta acción no se puede deshacer.
            </p>
            <div className="nested-confirm-actions">
              <button className="secondary-button" onClick={() => setConfirmDeleteOpen(false)} type="button">
                Cancelar
              </button>
              <button className="primary-button red" onClick={handleConfirmDelete} type="button">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
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
  saving = false,
  setDraft,
}: {
  draft: ExpenseDraft
  error: string | null
  onClose: () => void
  onSave: () => void
  saving?: boolean
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
            <button className="secondary-button" disabled={saving} onClick={onClose} type="button">Cancelar</button>
            <button className="primary-button green" disabled={saving} onClick={onSave} type="button">
              {saving ? 'Guardando…' : 'Crear gasto'}
            </button>
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
  'aria-label': ariaLabel,
  label,
  onClick,
  selected,
  selectionRing,
  sub,
  value,
}: {
  accent?: 'green' | 'orange' | string
  'aria-label'?: string
  label: string
  onClick?: () => void
  selected?: boolean
  selectionRing?: 'green' | 'orange'
  sub?: string
  value: string
}) {
  const inner = (
    <>
      <span>{label}</span>
      <strong className={accent ? `accent-${accent}` : undefined}>{value}</strong>
      {sub ? <p>{sub}</p> : null}
    </>
  )

  if (onClick) {
    const ringClass = selected && selectionRing === 'orange' ? ' selection-ring-orange' : ''

    return (
      <button
        aria-label={ariaLabel ?? label}
        aria-pressed={selected}
        className={`stat-card stat-card--clickable${selected ? ' selected' : ''}${ringClass}`}
        onClick={onClick}
        type="button"
      >
        {inner}
      </button>
    )
  }

  return <article className="stat-card">{inner}</article>
}

function Segmented<T extends string>({
  active,
  onChange,
  options,
}: {
  active: T | null
  onChange: (value: T) => void
  options: Array<{ key: T; label: string; count?: number }>
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          aria-pressed={active !== null && active === option.key}
          className={active !== null && active === option.key ? 'selected' : ''}
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

function PaymentMethodIcon({ method }: { method: Sale['paymentMethod'] }) {
  const label = ventasPaymentMethodLabel(method)

  if (method === null) {
    return (
      <span
        aria-label={label}
        className="sale-row-payment-icon sale-row-payment-icon--unset"
        role="img"
        title={label}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M7 12h10" />
        </svg>
      </span>
    )
  }

  const graphic =
    method === 'transferencia' ? (
      <>
        {/* Flechas izquierda/derecha — más anchas y con más contraste que una sola línea */}
        <path d="M8 12h8" />
        <path d="M17 12l3.25-3M17 12l3.25 3" />
        <path d="M7 12l-3.25-3M7 12l-3.25 3" />
      </>
    ) : method === 'efectivo' ? (
      <>
        <rect height="11" rx="2" width="18" x="3" y="7" />
        <circle cx="12" cy="12.5" r="2.5" />
      </>
    ) : (
      <>
        <path d="M4 9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Z" />
        <path d="M17 9h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-3a3 3 0 0 1 0-6Z" />
      </>
    )

  return (
    <span
      aria-label={label}
      className={`sale-row-payment-icon sale-row-payment-icon--${method}`}
      role="img"
      title={label}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        {graphic}
      </svg>
    </span>
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

type IconName =
  | 'search'
  | 'close'
  | 'chart'
  | 'home'
  | 'bag'
  | 'person'
  | 'package'
  | 'chevron-down'
  | 'trash'

function Icon({ name }: { name: IconName }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
    close: <path d="M18 6 6 18M6 6l12 12" />,
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
    trash: (
      <>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" x2="10" y1="11" y2="17" />
        <line x1="14" x2="14" y1="11" y2="17" />
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

function isSalePending(sale: Sale) {
  if (sale.quantity === null || sale.unitPriceArs === null) return true

  return getSalePending(sale) > 0
}

function isDelivered(sale: Sale) {
  return (sale.delivered ?? '').trim().toLowerCase() === 'si'
}

/** Facturación pendiente (no incluye «no se factura» ni ya facturadas). */
function isInvoicePending(sale: Sale): boolean {
  return (sale.invoiceStatus ?? 'pendiente') === 'pendiente'
}

/** Encargos: `payment_status = encargo` (sin entregar), o filas legacy sin entregar con cobro pendiente (misma lista que antes de migrar). */
function isEncargoSale(sale: Sale): boolean {
  if (sale.paymentStatus === 'encargo') {
    return !isDelivered(sale)
  }

  return !isDelivered(sale) && isSalePending(sale)
}

/** Al marcar entregado, sale del bucket encargo → estados de ventas principales. */
function paymentStatusAfterDeliveredEncargo(sale: Sale): Sale['paymentStatus'] {
  const q = sale.quantity ?? 0
  const pu = sale.unitPriceArs ?? 0
  const total = q * pu
  if (total <= 0 && sale.paidArs <= 0) return 'pendiente'
  if (total > 0 && sale.paidArs >= total) return 'cobrado'
  if (sale.paidArs > 0) return 'parcial'

  return 'pendiente'
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

function compareExpensesNewestFirst(a: Expense, b: Expense): number {
  if (b.year !== a.year) return b.year - a.year
  const monthDelta = expenseMonthIndex(b.month) - expenseMonthIndex(a.month)
  if (monthDelta !== 0) return monthDelta

  const createdDelta = b.createdAt.localeCompare(a.createdAt)
  if (createdDelta !== 0) return createdDelta

  return b.id.localeCompare(a.id)
}

function sortExpensesWithinMonthGroup(rows: Expense[]): Expense[] {
  const indexById = new Map(rows.map((row, index) => [row.id, index]))

  return [...rows].sort((a, b) => {
    const createdDelta = b.createdAt.localeCompare(a.createdAt)
    if (createdDelta !== 0) return createdDelta

    return (indexById.get(b.id) ?? 0) - (indexById.get(a.id) ?? 0)
  })
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

function salePaymentTierFromSale(sale: Sale): SalePaymentTier {
  if (sale.paymentStatus === 'cobrado') return 'pagado'
  if (sale.paymentStatus === 'parcial') return 'parcial'
  if (sale.paymentStatus === 'encargo') {
    const q = sale.quantity ?? 0
    const pu = sale.unitPriceArs ?? 0
    const total = q * pu
    if (sale.paidArs <= 0) return 'porPagar'
    if (total > 0 && sale.paidArs >= total) return 'pagado'

    return 'parcial'
  }

  const q = sale.quantity ?? 0
  const pu = sale.unitPriceArs ?? 0
  const total = q * pu
  if (sale.paidArs <= 0) return 'porPagar'
  if (total > 0 && sale.paidArs >= total) return 'pagado'

  return 'parcial'
}

function saleLineTotalArsDraft(draft: SaleDraft): number | null {
  const q = parseOptionalNumber(draft.quantity)
  const p = parseOptionalNumber(draft.unitPriceArs)
  if (q === null || p === null || q <= 0 || p <= 0) return null

  return q * p
}

function draftResolveSalePayment(
  draft: SaleDraft,
  opts?: { undeliveredEncargoBucket?: boolean },
):
  | { ok: true; paidArs: number; paymentStatus: Sale['paymentStatus'] }
  | { ok: false; error: string; field: SaleDraftErrorField } {
  const deliveredSi = (draft.delivered ?? '').trim().toLowerCase() === 'si'

  if (opts?.undeliveredEncargoBucket && !deliveredSi) {
    if (draft.paymentTier === 'porPagar') {
      return { ok: true, paidArs: 0, paymentStatus: 'encargo' }
    }

    const totalEncargo = saleLineTotalArsDraft(draft)

    if (draft.paymentTier === 'parcial') {
      if (totalEncargo === null || totalEncargo <= 0) {
        return {
          ok: false,
          error: 'Completá unidades y precio unitario para registrar un pago parcial.',
          field: 'saleLine',
        }
      }

      const part = parseOptionalNumber(draft.partialPaidArs)
      if (part === null || part <= 0) {
        return { ok: false, error: 'Ingresa el monto del pago parcial', field: 'partialPaid' }
      }

      if (part >= totalEncargo) {
        return {
          ok: false,
          error: 'El monto parcial tiene que ser menor al total de la venta.',
          field: 'partialPaid',
        }
      }

      return { ok: true, paidArs: part, paymentStatus: 'encargo' }
    }
  }

  if (draft.paymentTier === 'porPagar') {
    return { ok: true, paidArs: 0, paymentStatus: 'pendiente' }
  }

  const total = saleLineTotalArsDraft(draft)

  if (draft.paymentTier === 'parcial') {
    if (total === null || total <= 0) {
      return {
        ok: false,
        error: 'Completá unidades y precio unitario para registrar un pago parcial.',
        field: 'saleLine',
      }
    }

    const part = parseOptionalNumber(draft.partialPaidArs)
    if (part === null || part <= 0) {
      return { ok: false, error: 'Ingresa el monto del pago parcial', field: 'partialPaid' }
    }

    if (part >= total) {
      return {
        ok: false,
        error: 'El monto parcial tiene que ser menor al total de la venta.',
        field: 'partialPaid',
      }
    }

    return { ok: true, paidArs: part, paymentStatus: 'parcial' }
  }

  if (total === null || total <= 0) {
    return {
      ok: false,
      error: 'Completá unidades y precio unitario para marcar como pagada.',
      field: 'saleLine',
    }
  }

  return { ok: true, paidArs: total, paymentStatus: 'cobrado' }
}

function saleToDraft(sale: Sale): SaleDraft {
  const tier = salePaymentTierFromSale(sale)

  return {
    buyer: sale.buyer,
    seller: sale.seller ?? '',
    quantity: sale.quantity?.toString() ?? '',
    unitPriceArs: sale.unitPriceArs?.toString() ?? '',
    partialPaidArs: tier === 'parcial' ? sale.paidArs.toString() : '',
    paymentMethod: sale.paymentMethod,
    transferDestination: sale.transferDestination ?? 'Delfi',
    paymentTier: tier,
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
    partialPaidArs: '',
    paymentMethod: null,
    transferDestination: 'Delfi',
    paymentTier: 'porPagar',
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

function pagadoPaymentMethodValidationError(draft: SaleDraft): string | null {
  if (draft.paymentTier !== 'pagado') return null

  if (draft.paymentMethod !== 'transferencia' && draft.paymentMethod !== 'efectivo') {
    return 'Si la venta está pagada, seleccioná Transferencia o Efectivo como medio de pago.'
  }

  return null
}

/** Ya no se ofrece «Otro» en el formulario; al cobrar hay que migrar ventas viejas. */
function otroPaymentMethodValidationError(draft: SaleDraft): string | null {
  if (draft.paymentMethod !== 'otro') return null
  if (draft.paymentTier !== 'pagado') return null

  return 'Elegí Transferencia o Efectivo como medio de pago antes de guardar.'
}

function draftToSaleInput(
  draft: SaleDraft,
  opts?: { undeliveredEncargoBucket?: boolean },
): SaleCreateInput {
  const resolved = draftResolveSalePayment(draft, opts)
  if (!resolved.ok) {
    throw new Error(resolved.error)
  }

  return {
    buyer: draft.buyer.trim(),
    seller: emptyToNull(draft.seller),
    quantity: parseOptionalNumber(draft.quantity),
    unitPriceArs: parseOptionalNumber(draft.unitPriceArs),
    paidArs: resolved.paidArs,
    paymentMethod: draft.paymentMethod,
    transferDestination:
      draft.paymentMethod === 'transferencia' ? draft.transferDestination : null,
    paymentStatus: resolved.paymentStatus,
    invoiceStatus: draft.invoiceStatus,
    delivered: emptyToNull(draft.delivered),
    billingNotes: emptyToNull(draft.billingNotes),
  }
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
