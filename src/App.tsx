import './App.css'
import { useEffect, useMemo, useState } from 'react'
import { calculateSaleBreakdown } from './data/ventas'
import { isSupabaseConfigured } from './lib/supabase'
import {
  createSale,
  deleteSale,
  fallbackVentasData,
  loadVentasData,
  updateInvoiceStatus,
  updateStockAllocations,
  updateSale,
  type SaleCreateInput,
  type SaleUpdateInput,
  type VentasData,
} from './lib/ventasRepository'
import type { Sale, StockAllocation } from './types'

type AppTab = 'home' | 'ventas' | 'promo' | 'gastos'
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
type PromoGroup = keyof typeof promoData
type PromoDraft = {
  nombre: string
  unidades: string
  group: PromoGroup
  entregado: string
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

const promoData = {
  equipo: [
    { nombre: 'Fede', unidades: 1, entregado: true },
    { nombre: 'Lali', unidades: 1, entregado: false },
    { nombre: 'Diego', unidades: 1, entregado: false },
    { nombre: 'Wonky', unidades: 10, entregado: false },
    { nombre: 'Mery Casabal', unidades: 1, entregado: false },
    { nombre: 'Belu LM', unidades: 1, entregado: false },
    { nombre: 'Susan', unidades: 5, entregado: false },
    { nombre: 'Mechi', unidades: 5, entregado: true },
    { nombre: 'Delfi', unidades: 5, entregado: true },
  ],
  colaboracion: [
    { nombre: 'Dani', unidades: 1, entregado: false },
    { nombre: 'Fide', unidades: 1, entregado: true },
    { nombre: 'Lujan', unidades: 1, entregado: true },
    { nombre: 'Magdalena', unidades: 1, entregado: false },
    { nombre: 'Anita', unidades: 1, entregado: true },
    { nombre: 'Tobi', unidades: 1, entregado: true },
    { nombre: 'Agus Vera', unidades: 1, entregado: false },
    { nombre: 'Marisol Otero', unidades: 1, entregado: false },
    { nombre: 'Flor Otero', unidades: 1, entregado: false },
    { nombre: 'Rocio Hernandez', unidades: 1, entregado: true },
    { nombre: 'Juana Ibañez', unidades: 1, entregado: false },
    { nombre: 'Mora Rivarola', unidades: 1, entregado: false },
    { nombre: 'Juana Silveyra', unidades: 1, entregado: false },
    { nombre: 'Paz Díaz Colodrero', unidades: 1, entregado: false },
    { nombre: 'Vane Butera', unidades: 1, entregado: false },
    { nombre: 'Agus Caballero', unidades: 1, entregado: false },
    { nombre: 'Stephie Sibbald', unidades: 1, entregado: false },
    { nombre: 'Clarita Eickert', unidades: 1, entregado: false },
  ],
  influencers: [
    { nombre: 'Silvia Figgiacone', unidades: 1, entregado: false },
    { nombre: 'Jose Pelayo', unidades: 1, entregado: false },
    { nombre: 'Euge Boni', unidades: 1, entregado: false },
    { nombre: 'Christian Plebst', unidades: 1, entregado: false },
    { nombre: 'Mejor Descalzos', unidades: 1, entregado: false },
    { nombre: 'Rochi', unidades: 0, entregado: false },
    { nombre: 'Julieta Prandi', unidades: 0, entregado: false },
    { nombre: 'Diego Torres', unidades: 0, entregado: false },
    { nombre: 'Dai Ruggeri', unidades: 0, entregado: false },
  ],
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
  const [tab, setTab] = useState<AppTab>('home')
  const [ventasData, setVentasData] = useState<VentasData>(fallbackVentasData)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null)
  const [saleDraft, setSaleDraft] = useState<SaleDraft | null>(null)
  const [savingSaleId, setSavingSaleId] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [createDraft, setCreateDraft] = useState<SaleDraft | null>(null)
  const [savingNewSale, setSavingNewSale] = useState(false)
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null)
  const [savingStockAllocations, setSavingStockAllocations] = useState(false)
  const [stockAllocationError, setStockAllocationError] = useState<string | null>(null)
  const [togglingDeliveryId, setTogglingDeliveryId] = useState<string | null>(null)
  const [savingInvoiceSaleId, setSavingInvoiceSaleId] = useState<string | null>(null)

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

  const { projectConfig, sales, stockAllocations } = ventasData
  const saleBreakdowns = sales.map((sale) => calculateSaleBreakdown(sale, projectConfig))
  const soldCopies = sales.reduce((total, sale) => total + (sale.quantity ?? 0), 0)
  const grossSalesArs = saleBreakdowns.reduce((total, item) => total + item.grossArs, 0)
  const paidSalesArs = sales.reduce((total, sale) => total + sale.paidArs, 0)
  const pendingSalesArs = grossSalesArs - paidSalesArs
  const abrazandoCuentosArs = saleBreakdowns.reduce(
    (total, item) => total + item.abrazandoCuentosArs,
    0,
  )
  const wonkyArs = saleBreakdowns.reduce((total, item) => total + item.wonkyArs, 0)
  const bookCostsUsd = saleBreakdowns.reduce((total, item) => total + item.bookCostUsd, 0)

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
    setEditingSaleId(sale.id)
    setEditError(null)
    setSaleDraft({
      buyer: sale.buyer,
      seller: sale.seller ?? '',
      quantity: sale.quantity?.toString() ?? '',
      unitPriceArs: sale.unitPriceArs?.toString() ?? '',
      paidArs: sale.paidArs.toString(),
      paymentMethod: sale.paymentMethod,
      paymentStatus: sale.paymentStatus,
      invoiceStatus: sale.invoiceStatus ?? 'no_aplica',
      delivered: sale.delivered ?? '',
      billingNotes: sale.billingNotes ?? '',
    })
  }

  function cancelEditingSale() {
    setEditingSaleId(null)
    setSaleDraft(null)
    setEditError(null)
  }

  async function saveEditingSale(saleId: string) {
    if (!saleDraft) return

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
      cancelEditingSale()
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'No se pudo guardar la venta.')
    } finally {
      setSavingSaleId(null)
    }
  }

  function handleCreateSale() {
    setEditError(null)
    setCreateDraft(createEmptySaleDraft())
  }

  async function saveNewSale() {
    if (!createDraft) return

    const input = draftToSaleInput(createDraft)

    if (!input.buyer) {
      setEditError('Completá el nombre del comprador.')
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
      setTab('ventas')
      setCreateDraft(null)
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
        invoiceStatus: sale.invoiceStatus ?? 'no_aplica',
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

  return (
    <main className="ios-app">
      {tab === 'home' ? (
        <HomeScreen
          abrazandoCuentosArs={abrazandoCuentosArs}
          bookCostsUsd={bookCostsUsd}
          copyPaymentAlias={copyPaymentAlias}
          copyStatus={copyStatus}
          grossSalesArs={grossSalesArs}
          loadError={loadError}
          loading={loading}
          projectConfig={projectConfig}
          saveStockAllocationChanges={saveStockAllocationChanges}
          savingStockAllocations={savingStockAllocations}
          soldCopies={soldCopies}
          stockAllocationError={stockAllocationError}
          stockAllocations={stockAllocations}
          wonkyArs={wonkyArs}
        />
      ) : null}
      {tab === 'ventas' ? (
        <VentasScreen
          editError={editError}
          editingSaleId={editingSaleId}
          grossSalesArs={grossSalesArs}
          paidSalesArs={paidSalesArs}
          pendingSalesArs={pendingSalesArs}
          saleDraft={saleDraft}
          sales={sales}
          savingSaleId={savingSaleId}
          togglingDeliveryId={togglingDeliveryId}
          cancelEditingSale={cancelEditingSale}
          saveEditingSale={saveEditingSale}
          setSaleDraft={setSaleDraft}
          onSelectSale={setSelectedSale}
          onToggleDelivered={toggleSaleDelivered}
        />
      ) : null}
      {tab === 'promo' ? <PromocionalesScreen /> : null}
      {tab === 'gastos' ? <GastosScreen /> : null}

      {selectedSale ? (
        <SaleDetailSheet
          editError={editError}
          editingSaleId={editingSaleId}
          sale={selectedSale}
          saleDraft={saleDraft}
          savingSaleId={savingSaleId}
          savingInvoice={savingInvoiceSaleId === selectedSale.id}
          cancelEditingSale={cancelEditingSale}
          onClose={() => {
            setSelectedSale(null)
            cancelEditingSale()
          }}
          deleting={deletingSaleId === selectedSale.id}
          deleteSale={handleDeleteSale}
          saveEditingSale={saveEditingSale}
          setSaleDraft={setSaleDraft}
          startEditingSale={startEditingSale}
          updateInvoiceStatus={updateSaleInvoiceStatus}
        />
      ) : null}

      {createDraft ? (
        <NewSaleSheet
          createDraft={createDraft}
          editError={editError}
          saving={savingNewSale}
          onClose={() => {
            setCreateDraft(null)
            setEditError(null)
          }}
          saveNewSale={saveNewSale}
          setCreateDraft={setCreateDraft}
        />
      ) : null}

      {tab === 'home' || tab === 'ventas' ? (
        <button
          aria-label="Agregar venta"
          className="floating-add-button"
          onClick={handleCreateSale}
          type="button"
        >
          +
        </button>
      ) : null}

      <TabBar active={tab} onChange={setTab} />
    </main>
  )
}

function HomeScreen({
  abrazandoCuentosArs,
  bookCostsUsd,
  copyPaymentAlias,
  copyStatus,
  grossSalesArs,
  loadError,
  loading,
  projectConfig,
  saveStockAllocationChanges,
  savingStockAllocations,
  soldCopies,
  stockAllocationError,
  stockAllocations,
  wonkyArs,
}: {
  abrazandoCuentosArs: number
  bookCostsUsd: number
  copyPaymentAlias: () => void
  copyStatus: 'idle' | 'copied' | 'error'
  grossSalesArs: number
  loadError: string | null
  loading: boolean
  projectConfig: VentasData['projectConfig']
  saveStockAllocationChanges: (allocations: StockAllocation[]) => Promise<void>
  savingStockAllocations: boolean
  soldCopies: number
  stockAllocationError: string | null
  stockAllocations: VentasData['stockAllocations']
  wonkyArs: number
}) {
  const [editingInventory, setEditingInventory] = useState(false)
  const [stockDraft, setStockDraft] = useState<StockAllocationDraft>(() => {
    return createStockAllocationDraft(stockAllocations)
  })
  const [localStockError, setLocalStockError] = useState<string | null>(null)
  const availableCopies = projectConfig.firstPrintRun.copies - soldCopies
  const copiesPerBox = projectConfig.firstPrintRun.copies / projectConfig.firstPrintRun.boxes
  const allocatedCopies = stockAllocations.reduce((total, item) => total + item.copies, 0)
  const inventoryError = localStockError ?? stockAllocationError

  function startEditingInventory() {
    setStockDraft(createStockAllocationDraft(stockAllocations))
    setLocalStockError(null)
    setEditingInventory(true)
  }

  function cancelEditingInventory() {
    setStockDraft(createStockAllocationDraft(stockAllocations))
    setLocalStockError(null)
    setEditingInventory(false)
  }

  async function saveEditingInventory() {
    const nextAllocations = stockAllocations.map((allocation) => ({
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
            {stockAllocations.map((item) => (
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
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${(item.copies / allocatedCopies) * 100}%` }}
                  />
                </div>
              </div>
            ))}
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

        <div className="ios-card">
          <SectionTitle eyebrow="Reglas" title="Costos asociados a cada venta" />
          <RuleRow label="Abrazando cuentos" value={`${projectConfig.costRules.abrazandoCuentosShare * 100}%`} />
          <RuleRow label="Wonky" value={`${projectConfig.costRules.wonkyShare * 100}%`} />
          <RuleRow label="Costo por libro" value={currencyUsdFormatter.format(projectConfig.costRules.bookCostUsd)} />
          <p className="card-note">Totales calculados con ventas cargadas</p>
          <RuleRow label="Abrazando cuentos" value={currencyArsFormatter.format(abrazandoCuentosArs)} />
          <RuleRow label="Wonky" value={currencyArsFormatter.format(wonkyArs)} />
          <RuleRow label="Costo libros" value={currencyUsdFormatter.format(bookCostsUsd)} />
        </div>
      </div>
    </section>
  )
}

function VentasScreen({
  cancelEditingSale,
  editError,
  editingSaleId,
  grossSalesArs,
  paidSalesArs,
  pendingSalesArs,
  onSelectSale,
  onToggleDelivered,
  saleDraft,
  sales,
  savingSaleId,
  saveEditingSale,
  setSaleDraft,
  togglingDeliveryId,
}: {
  cancelEditingSale: () => void
  editError: string | null
  editingSaleId: string | null
  grossSalesArs: number
  paidSalesArs: number
  pendingSalesArs: number
  onSelectSale: (sale: Sale) => void
  onToggleDelivered: (sale: Sale) => void
  saleDraft: SaleDraft | null
  sales: Sale[]
  savingSaleId: string | null
  saveEditingSale: (saleId: string) => void
  setSaleDraft: (draft: SaleDraft) => void
  togglingDeliveryId: string | null
}) {
  const [filter, setFilter] = useState<'todas' | 'pendiente' | 'porEntregar'>('todas')
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
        (filter === 'porEntregar' && !isDelivered(sale))
      const matchesQuery = sale.buyer.toLowerCase().includes(query.toLowerCase())

      return matchesFilter && matchesQuery
    })
  }, [filter, query, sellerScopedSales])

  const pendingCount = sellerScopedSales.filter(isSalePending).length
  const deliveryCount = sellerScopedSales.filter((sale) => !isDelivered(sale)).length
  const sellerTotals = useMemo(() => {
    return sellerNames.map((seller) => {
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
        <StatCard accent="orange" label="Pendiente" value={formatCompact(pendingSalesArs)} />
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
            <span>{item.seller === 'Abrazandocuentos' ? 'AC' : item.seller}</span>
            <strong>{formatCompact(item.total)}</strong>
            <p>{item.count} {item.count === 1 ? 'venta' : 'ventas'}</p>
          </button>
        ))}
      </div>

      <Segmented
        active={filter}
        options={[
          { key: 'todas', label: 'Todas', count: sellerScopedSales.length },
          { key: 'pendiente', label: 'Pendiente', count: pendingCount },
          { key: 'porEntregar', label: 'Por entregar', count: deliveryCount },
        ]}
        onChange={setFilter}
      />

      {editError ? <p className="edit-error">{editError}</p> : null}

      <div className="list-group">
        {filteredSales.map((sale, index) => (
          <SaleRow
            cancelEditingSale={cancelEditingSale}
            editing={editingSaleId === sale.id}
            isLast={index === filteredSales.length - 1}
            key={sale.id}
            sale={sale}
            saleDraft={saleDraft}
            saving={savingSaleId === sale.id}
            saveEditingSale={saveEditingSale}
            setSaleDraft={setSaleDraft}
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

function SaleRow({
  cancelEditingSale,
  editing,
  isLast,
  onSelectSale,
  onToggleDelivered,
  sale,
  saleDraft,
  saving,
  saveEditingSale,
  setSaleDraft,
  togglingDelivery,
}: {
  cancelEditingSale: () => void
  editing: boolean
  isLast: boolean
  onSelectSale: (sale: Sale) => void
  onToggleDelivered: (sale: Sale) => void
  sale: Sale
  saleDraft: SaleDraft | null
  saving: boolean
  saveEditingSale: (saleId: string) => void
  setSaleDraft: (draft: SaleDraft) => void
  togglingDelivery: boolean
}) {
  const totalArs = getSaleTotal(sale)
  const pendingArs = getSalePending(sale)
  const status = getSaleStatus(sale)

  if (editing && saleDraft) {
    return (
      <div className={`sale-row edit ${isLast ? 'last' : ''}`}>
        <div className="edit-grid">
          <input value={saleDraft.buyer} onChange={(event) => setSaleDraft({ ...saleDraft, buyer: event.target.value })} />
          <SellerSelect value={saleDraft.seller} onChange={(seller) => setSaleDraft({ ...saleDraft, seller })} />
          <input inputMode="numeric" placeholder="Unidades" value={saleDraft.quantity} onChange={(event) => setSaleDraft({ ...saleDraft, quantity: event.target.value })} />
          <input inputMode="numeric" placeholder="Precio" value={saleDraft.unitPriceArs} onChange={(event) => setSaleDraft({ ...saleDraft, unitPriceArs: event.target.value })} />
          <input inputMode="numeric" placeholder="Pagado" value={saleDraft.paidArs} onChange={(event) => setSaleDraft({ ...saleDraft, paidArs: event.target.value })} />
          <select value={saleDraft.paymentMethod} onChange={(event) => setSaleDraft({ ...saleDraft, paymentMethod: event.target.value as Sale['paymentMethod'] })}>
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="otro">Otro</option>
          </select>
          <InvoiceStatusSelect value={saleDraft.invoiceStatus} onChange={(invoiceStatus) => setSaleDraft({ ...saleDraft, invoiceStatus })} />
          <DeliveredSelect value={saleDraft.delivered} onChange={(delivered) => setSaleDraft({ ...saleDraft, delivered })} />
          <input className="wide" placeholder="Nota" value={saleDraft.billingNotes} onChange={(event) => setSaleDraft({ ...saleDraft, billingNotes: event.target.value })} />
        </div>
        <div className="edit-actions">
          <button className="secondary-button" onClick={cancelEditingSale} type="button">Cancelar</button>
          <button className="primary-button" disabled={saving} onClick={() => saveEditingSale(sale.id)} type="button">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    )
  }

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
        <InvoiceIcon status={sale.invoiceStatus ?? 'no_aplica'} />
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

function SaleDetailSheet({
  cancelEditingSale,
  deleting,
  deleteSale,
  editError,
  editingSaleId,
  onClose,
  sale,
  saleDraft,
  savingInvoice,
  savingSaleId,
  saveEditingSale,
  setSaleDraft,
  startEditingSale,
  updateInvoiceStatus,
}: {
  cancelEditingSale: () => void
  deleting: boolean
  deleteSale: (sale: Sale) => void
  editError: string | null
  editingSaleId: string | null
  onClose: () => void
  sale: Sale
  saleDraft: SaleDraft | null
  savingInvoice: boolean
  savingSaleId: string | null
  saveEditingSale: (saleId: string) => void
  setSaleDraft: (draft: SaleDraft) => void
  startEditingSale: (sale: Sale) => void
  updateInvoiceStatus: (sale: Sale, invoiceStatus: NonNullable<Sale['invoiceStatus']>) => void
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const totalArs = getSaleTotal(sale)
  const pendingArs = getSalePending(sale)
  const paidPct = totalArs > 0 ? Math.round((sale.paidArs / totalArs) * 100) : 0
  const status = getSaleStatus(sale)
  const editing = editingSaleId === sale.id && saleDraft

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

        {editing ? (
          <div className="sheet-edit">
            <SaleRow
              cancelEditingSale={cancelEditingSale}
              editing
              isLast
              onSelectSale={() => undefined}
              onToggleDelivered={() => undefined}
              sale={sale}
              saleDraft={saleDraft}
              saving={savingSaleId === sale.id}
              saveEditingSale={saveEditingSale}
              setSaleDraft={setSaleDraft}
              togglingDelivery={false}
            />
            {editError ? <p className="edit-error">{editError}</p> : null}
          </div>
        ) : (
          <>
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
                <span>Pendiente {currencyArsFormatter.format(pendingArs)}</span>
              </div>
            </div>

            <ListGroup title="Desglose">
              <ListItem label="Unidades" value={sale.quantity?.toString() ?? '-'} />
              <ListItem label="Precio unitario" value={sale.unitPriceArs === null ? '-' : currencyArsFormatter.format(sale.unitPriceArs)} />
              <ListItem label="Subtotal" value={currencyArsFormatter.format(totalArs)} />
              <ListItem label="Vendedor" value={sale.seller ?? '-'} />
            </ListGroup>
            <ListGroup title="Entrega">
              <ListItem label="Estado" value={sale.delivered ?? 'Por entregar'} />
              <ListItem label="Nota" value={sale.billingNotes ?? '-'} />
            </ListGroup>
            <ListGroup title="Facturación">
              <div className="sheet-list-item">
                <span>Estado</span>
                <select
                  className="sheet-select"
                  disabled={savingInvoice}
                  value={sale.invoiceStatus ?? 'no_aplica'}
                  onChange={(event) => updateInvoiceStatus(sale, event.target.value as NonNullable<Sale['invoiceStatus']>)}
                >
                  <option value="no_aplica">No va a ser facturado</option>
                  <option value="no_facturado">No facturado</option>
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
          </>
        )}
      </div>
    </div>
  )
}

function NewSaleSheet({
  createDraft,
  editError,
  onClose,
  saving,
  saveNewSale,
  setCreateDraft,
}: {
  createDraft: SaleDraft
  editError: string | null
  onClose: () => void
  saving: boolean
  saveNewSale: () => void
  setCreateDraft: (draft: SaleDraft) => void
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <div>
            <h2>Nueva venta</h2>
            <p>Cargá los detalles antes de guardar el registro.</p>
          </div>
          <button className="close-button" onClick={onClose} type="button">×</button>
        </div>

        <div className="new-sale-form">
          <div className="edit-grid">
            <input placeholder="Comprador" value={createDraft.buyer} onChange={(event) => setCreateDraft({ ...createDraft, buyer: event.target.value })} />
            <SellerSelect value={createDraft.seller} onChange={(seller) => setCreateDraft({ ...createDraft, seller })} />
            <input inputMode="numeric" placeholder="Unidades" value={createDraft.quantity} onChange={(event) => setCreateDraft({ ...createDraft, quantity: event.target.value })} />
            <input inputMode="numeric" placeholder="Precio unitario" value={createDraft.unitPriceArs} onChange={(event) => setCreateDraft({ ...createDraft, unitPriceArs: event.target.value })} />
            <input inputMode="numeric" placeholder="Pagado" value={createDraft.paidArs} onChange={(event) => setCreateDraft({ ...createDraft, paidArs: event.target.value })} />
            <select value={createDraft.paymentMethod} onChange={(event) => setCreateDraft({ ...createDraft, paymentMethod: event.target.value as Sale['paymentMethod'] })}>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="otro">Otro</option>
            </select>
            <select value={createDraft.paymentStatus} onChange={(event) => setCreateDraft({ ...createDraft, paymentStatus: event.target.value as Sale['paymentStatus'] })}>
              <option value="pendiente">Pendiente</option>
              <option value="cobrado">Cobrado</option>
            </select>
            <DeliveredSelect value={createDraft.delivered} onChange={(delivered) => setCreateDraft({ ...createDraft, delivered })} />
            <input className="wide" placeholder="Nota" value={createDraft.billingNotes} onChange={(event) => setCreateDraft({ ...createDraft, billingNotes: event.target.value })} />
          </div>
          {editError ? <p className="edit-error">{editError}</p> : null}
          <div className="edit-actions">
            <button className="secondary-button" onClick={onClose} type="button">Cancelar</button>
            <button className="primary-button" disabled={saving} onClick={saveNewSale} type="button">
              {saving ? 'Guardando...' : 'Crear venta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PromocionalesScreen() {
  const [filter, setFilter] = useState<'todos' | 'pendientes' | 'entregados'>('todos')
  const [promoRows, setPromoRows] = useState(promoData)
  const [promoDraft, setPromoDraft] = useState<PromoDraft | null>(null)
  const [promoError, setPromoError] = useState<string | null>(null)
  const all = [...promoRows.equipo, ...promoRows.colaboracion, ...promoRows.influencers]
  const total = all.reduce((sum, row) => sum + row.unidades, 0)
  const delivered = all.filter((row) => row.entregado).reduce((sum, row) => sum + row.unidades, 0)

  function toggleDelivered(group: keyof typeof promoData, nombre: string) {
    setPromoRows((current) => ({
      ...current,
      [group]: current[group].map((row) => (
        row.nombre === nombre ? { ...row, entregado: !row.entregado } : row
      )),
    }))
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
        },
      ],
    }))
    setPromoDraft(null)
    setPromoError(null)
  }

  return (
    <section className="screen">
      <ScreenHeader
        eyebrow="Mambula"
        title="Promocionales"
        subtitle="Ejemplares entregados al equipo, colaboradores e influencers."
      />
      <div className="stats-row">
        <StatCard label="Total" value={numberFormatter.format(total)} />
        <StatCard accent="green" label="Entregados" value={numberFormatter.format(delivered)} />
        <StatCard accent="orange" label="Pendientes" value={numberFormatter.format(total - delivered)} />
      </div>
      <Segmented
        active={filter}
        options={[
          { key: 'todos', label: 'Todos' },
          { key: 'pendientes', label: 'Pendientes' },
          { key: 'entregados', label: 'Entregados' },
        ]}
        onChange={setFilter}
      />
      <PromoSection filter={filter} group="equipo" rows={promoRows.equipo} tag="Equipo" title="Equipo Mambula" onToggleDelivered={toggleDelivered} />
      <PromoSection filter={filter} group="colaboracion" rows={promoRows.colaboracion} tag="Colaboración" title="Colaboradores" onToggleDelivered={toggleDelivered} />
      <PromoSection filter={filter} group="influencers" rows={promoRows.influencers} tag="Influencers" title="Prensa & influencers" onToggleDelivered={toggleDelivered} />
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

function GastosScreen() {
  const [filter, setFilter] = useState('todos')
  const [expenses, setExpenses] = useState(gastosData)
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft | null>(null)
  const [expenseError, setExpenseError] = useState<string | null>(null)
  const filtered = filter === 'todos' ? expenses : expenses.filter((item) => item.payer === filter)
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
  const groups = groupBy(filtered, (item) => `${item.month} ${item.year}`)

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
          <StatCard
            key={item.payer}
            label={item.payer}
            sub={`${item.count} gastos · ${currencyArsFormatter.format(item.pesos)}`}
            value={currencyUsdFormatter.format(item.usd)}
          />
        ))}
      </div>
      <Segmented
        active={filter}
        options={[
          { key: 'todos', label: 'Todos' },
          { key: 'Susan', label: 'Susan' },
          { key: 'Delfi', label: 'Delfi' },
          { key: 'Mechi', label: 'Mechi' },
        ]}
        onChange={setFilter}
      />
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
            <h2>Nueva promo</h2>
            <p>Cargá un nuevo ejemplar promocional.</p>
          </div>
          <button className="close-button" onClick={onClose} type="button">×</button>
        </div>

        <div className="new-sale-form">
          <div className="edit-grid">
            <input placeholder="Nombre" value={draft.nombre} onChange={(event) => setDraft({ ...draft, nombre: event.target.value })} />
            <input inputMode="numeric" placeholder="Unidades" value={draft.unidades} onChange={(event) => setDraft({ ...draft, unidades: event.target.value })} />
            <select value={draft.group} onChange={(event) => setDraft({ ...draft, group: event.target.value as PromoGroup })}>
              <option value="equipo">Equipo</option>
              <option value="colaboracion">Colaboración</option>
              <option value="influencers">Influencers</option>
            </select>
            <DeliveredSelect value={draft.entregado} onChange={(entregado) => setDraft({ ...draft, entregado })} />
          </div>
          {error ? <p className="edit-error">{error}</p> : null}
          <div className="edit-actions">
            <button className="secondary-button" onClick={onClose} type="button">Cancelar</button>
            <button className="primary-button red" onClick={onSave} type="button">Crear promo</button>
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
  onToggleDelivered,
  rows,
  tag,
  title,
}: {
  filter: 'todos' | 'pendientes' | 'entregados'
  group: keyof typeof promoData
  onToggleDelivered: (group: keyof typeof promoData, nombre: string) => void
  rows: Array<{ nombre: string; unidades: number; entregado: boolean }>
  tag: string
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
          <span>{tag}</span>
          <h2>{title}</h2>
        </div>
        <strong>{delivered}/{total} · {pct}%</strong>
      </div>
      <div className="progress-track">
        <div className="progress-fill green" style={{ width: `${pct}%` }} />
      </div>
      <div className="list-group">
        {visibleRows.map((row, index) => (
          <div className={`promo-row ${index === visibleRows.length - 1 ? 'last' : ''}`} key={row.nombre}>
            <Avatar name={row.nombre} size={34} />
            <strong>{row.nombre}</strong>
            <span>{row.unidades > 0 ? `${row.unidades} u.` : '—'}</span>
            <button
              aria-label={`${row.entregado ? 'Marcar como no entregado' : 'Marcar como entregado'}: ${row.nombre}`}
              className={row.entregado ? 'check-circle done' : 'check-circle'}
              onClick={() => onToggleDelivered(group, row.nombre)}
              type="button"
            >
              {row.entregado ? '✓' : ''}
            </button>
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
  onChange,
  value,
}: {
  onChange: (seller: string) => void
  value: string
}) {
  return (
    <select aria-label="Vendedor" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Vendedor</option>
      <option value="Delfi">Delfi</option>
      <option value="Mechi">Mechi</option>
      <option value="Susan">Susan</option>
      <option value="Abrazandocuentos">Abrazandocuentos</option>
    </select>
  )
}

function DeliveredSelect({
  onChange,
  value,
}: {
  onChange: (delivered: string) => void
  value: string
}) {
  return (
    <select aria-label="Entregado?" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Entregado?</option>
      <option value="SI">SI</option>
      <option value="NO">NO</option>
    </select>
  )
}

function InvoiceStatusSelect({
  onChange,
  value,
}: {
  onChange: (invoiceStatus: NonNullable<Sale['invoiceStatus']>) => void
  value: NonNullable<Sale['invoiceStatus']>
}) {
  return (
    <select aria-label="Facturación" value={value} onChange={(event) => onChange(event.target.value as NonNullable<Sale['invoiceStatus']>)}>
      <option value="no_aplica">No se factura</option>
      <option value="no_facturado">No facturado</option>
      <option value="pendiente">Pendiente</option>
      <option value="facturado">Facturado</option>
    </select>
  )
}

function TabBar({ active, onChange }: { active: AppTab; onChange: (tab: AppTab) => void }) {
  const tabs: Array<{ key: AppTab; label: string; icon: IconName }> = [
    { key: 'home', label: 'Inicio', icon: 'home' },
    { key: 'ventas', label: 'Ventas', icon: 'bag' },
    { key: 'promo', label: 'Promos', icon: 'chart' },
    { key: 'gastos', label: 'Gastos', icon: 'person' },
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
  if (status === 'no_aplica') return null

  return (
    <span className={`invoice-icon ${status}`} title={invoiceStatusLabel(status)}>
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M6 3h12v18l-2-1.2L14 21l-2-1.2L10 21l-2-1.2L6 21V3Z" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
      </svg>
    </span>
  )
}

function invoiceStatusLabel(status: NonNullable<Sale['invoiceStatus']>) {
  if (status === 'facturado') return 'Facturado'
  if (status === 'pendiente') return 'Facturación pendiente'
  if (status === 'no_facturado') return 'No facturado'
  return 'No va a ser facturado'
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="section-title">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
    </div>
  )
}

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rule-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function StatusPill({ kind }: { kind: 'pagado' | 'parcial' | 'pendiente' }) {
  return <span className={`status-pill ${kind}`}>{kind === 'pagado' ? 'Pagado' : kind === 'parcial' ? 'Parcial' : 'Pendiente'}</span>
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

type IconName = 'search' | 'chart' | 'home' | 'bag' | 'person'

function Icon({ name }: { name: IconName }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
    chart: <><path d="M3 3v18h18" /><path d="M7 14l4-4 4 4 5-6" /></>,
    home: <><path d="M3 12 12 3l9 9" /><path d="M5 10v10h14V10" /></>,
    bag: <><path d="M6 8h12l-1 13H7L6 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
    person: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
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

function createEmptySaleDraft(): SaleDraft {
  return {
    buyer: '',
    seller: '',
    quantity: '',
    unitPriceArs: '',
    paidArs: '',
    paymentMethod: 'transferencia',
    paymentStatus: 'pendiente',
    invoiceStatus: 'no_aplica',
    delivered: '',
    billingNotes: '',
  }
}

function createEmptyPromoDraft(): PromoDraft {
  return {
    nombre: '',
    unidades: '',
    group: 'colaboracion',
    entregado: '',
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
