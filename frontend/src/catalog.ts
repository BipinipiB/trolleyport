export interface Product {
  id: string
  name: string
  category: string
  unit: string
  price: number
  isVegetarian: boolean
  inStock: boolean
  onDeal: boolean
  dealPrice: number | null
}

// Categories in the order they first appear in the catalog.
export function categoriesOf(products: Product[]): string[] {
  return [...new Set(products.map((p) => p.category))]
}

// Money is handled in whole cents so totals never pick up floating-point drift.
export function priceInCents(product: Product): number {
  const price = product.onDeal && product.dealPrice !== null ? product.dealPrice : product.price
  return Math.round(price * 100)
}

/** Percentage saved on a deal, rounded, or null when the item isn't on deal. */
export function savingsPercent(product: Product): number | null {
  if (!product.onDeal || product.dealPrice === null || product.price <= 0) return null
  return Math.round((1 - product.dealPrice / product.price) * 100)
}

/**
 * Unit price for comparison, e.g. "$2.99/kg", "$2.25/L" or "$0.75 each", worked out from the pack size text.
 * Returns null when the size can't be read.
 */
export function unitPriceLabel(product: Product): string | null {
  const price = priceInCents(product) / 100
  const unit = product.unit.toLowerCase()
  const kg = unit.match(/(\d+(?:\.\d+)?)\s*kg\b/)
  const g = unit.match(/(\d+(?:\.\d+)?)\s*g\b/)
  const grams = kg ? Number(kg[1]) * 1000 : g ? Number(g[1]) : null
  if (grams) return `${nzd.format(price / (grams / 1000))}/kg`
  const litres = unit.match(/(\d+(?:\.\d+)?)\s*l\b/)
  if (litres) return `${nzd.format(price / Number(litres[1]))}/L`
  const pack = unit.match(/(\d+)\s*pack/)
  if (pack) return `${nzd.format(price / Number(pack[1]))} each`
  if (unit === 'each') return `${nzd.format(price)} each`
  return null
}

const nzd = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })

export function formatCents(cents: number): string {
  return nzd.format(cents / 100)
}
