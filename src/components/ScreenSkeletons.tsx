import type { ReactNode } from 'react'

function SkeletonBox({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton-box ${className}`.trim()} />
}

function SkeletonSearchBox() {
  return (
    <div aria-hidden="true" className="search-box skeleton-search-box">
      <SkeletonBox className="skeleton-search-icon" />
      <SkeletonBox className="skeleton-search-input" />
    </div>
  )
}

function SkeletonStatCards({
  className = 'stats-row',
  count = 3,
}: {
  className?: string
  count?: number
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, index) => (
        <div className="stat-card skeleton-stat-card" key={index}>
          <SkeletonBox className="skeleton-line skeleton-line-xs" />
          <SkeletonBox className="skeleton-line skeleton-line-lg" />
          <SkeletonBox className="skeleton-line skeleton-line-sm" />
        </div>
      ))}
    </div>
  )
}

function SkeletonSellerStats({ count = 4 }: { count?: number }) {
  return (
    <div className="seller-stats seller-stats--full-currency">
      {Array.from({ length: count }, (_, index) => (
        <div className="stat-card seller-stat skeleton-stat-card" key={index}>
          <SkeletonBox className="skeleton-line skeleton-line-xs" />
          <SkeletonBox className="skeleton-line skeleton-line-lg" />
          <SkeletonBox className="skeleton-line skeleton-line-sm" />
        </div>
      ))}
    </div>
  )
}

function SkeletonListRows({ count = 6 }: { count?: number }) {
  return (
    <div className="list-group skeleton-list-group">
      {Array.from({ length: count }, (_, index) => (
        <div className={`skeleton-list-row ${index === count - 1 ? 'last' : ''}`} key={index}>
          <div className="skeleton-list-row-main">
            <SkeletonBox className="skeleton-line skeleton-line-md" />
            <SkeletonBox className="skeleton-line skeleton-line-sm" />
          </div>
          <SkeletonBox className="skeleton-line skeleton-line-sm skeleton-line-right" />
        </div>
      ))}
    </div>
  )
}

function SkeletonCard({
  children,
  lines = 3,
}: {
  children?: ReactNode
  lines?: number
}) {
  return (
    <div aria-hidden="true" className="ios-card skeleton-card">
      <SkeletonBox className="skeleton-line skeleton-line-xs skeleton-card-eyebrow" />
      <SkeletonBox className="skeleton-line skeleton-line-md skeleton-card-title" />
      {children ??
        Array.from({ length: lines }, (_, index) => (
          <SkeletonBox className="skeleton-line skeleton-line-sm skeleton-card-row" key={index} />
        ))}
    </div>
  )
}

function SkeletonInventoryTable() {
  return (
    <div className="skeleton-inventory-table">
      <div className="skeleton-inventory-head">
        <SkeletonBox className="skeleton-line skeleton-line-xs" />
        <SkeletonBox className="skeleton-line skeleton-line-xs" />
        <SkeletonBox className="skeleton-line skeleton-line-xs" />
      </div>
      {Array.from({ length: 5 }, (_, index) => (
        <div className="skeleton-inventory-row" key={index}>
          <SkeletonBox className="skeleton-line skeleton-line-sm" />
          <SkeletonBox className="skeleton-line skeleton-line-sm" />
          <SkeletonBox className="skeleton-line skeleton-line-sm" />
        </div>
      ))}
    </div>
  )
}

export function HomeScreenSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando dashboard" className="screen-skeleton" role="status">
      <SkeletonBox className="skeleton-line skeleton-line-sm skeleton-sync-badge" />
      <SkeletonStatCards className="kpi-grid" count={4} />
      <SkeletonCard lines={0}>
        <SkeletonInventoryTable />
      </SkeletonCard>
      <SkeletonCard lines={5} />
      <SkeletonCard lines={4} />
      <SkeletonCard lines={4} />
      <SkeletonCard lines={3} />
    </div>
  )
}

export function VentasScreenSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando ventas" className="screen-skeleton" role="status">
      <SkeletonSearchBox />
      <SkeletonStatCards className="stats-row stats-row--full-currency" count={3} />
      <SkeletonSellerStats count={4} />
      <SkeletonListRows count={7} />
    </div>
  )
}

export function EncargosScreenSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando encargos" className="screen-skeleton" role="status">
      <SkeletonSearchBox />
      <SkeletonSellerStats count={3} />
      <SkeletonListRows count={5} />
    </div>
  )
}

export function PromocionalesScreenSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando promocionales" className="screen-skeleton" role="status">
      <SkeletonStatCards className="stats-row" count={3} />
      {Array.from({ length: 3 }, (_, index) => (
        <div className="skeleton-promo-section" key={index}>
          <SkeletonBox className="skeleton-line skeleton-line-md skeleton-promo-title" />
          <SkeletonListRows count={4} />
        </div>
      ))}
    </div>
  )
}

export function GastosScreenSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando gastos" className="screen-skeleton" role="status">
      <div className="ios-card big-total-card skeleton-card skeleton-total-card">
        <SkeletonBox className="skeleton-line skeleton-line-xs" />
        <SkeletonBox className="skeleton-line skeleton-line-xl" />
        <SkeletonBox className="skeleton-line skeleton-line-sm" />
      </div>
      <SkeletonStatCards className="payer-stats" count={3} />
      {Array.from({ length: 2 }, (_, index) => (
        <div className="expense-group skeleton-expense-group" key={index}>
          <div className="group-title">
            <SkeletonBox className="skeleton-line skeleton-line-sm" />
            <SkeletonBox className="skeleton-line skeleton-line-sm skeleton-line-right" />
          </div>
          <SkeletonListRows count={3} />
        </div>
      ))}
    </div>
  )
}
