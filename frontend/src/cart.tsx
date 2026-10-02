import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react'
import { priceInCents, type Product } from './catalog'

/** Who put a line in the cart: the shopping agent, or the shopper by hand. */
export type LineOrigin = 'agent' | 'manual'

export interface CartLine {
  product: Product
  quantity: number
  lineTotalCents: number
  origin: LineOrigin
}

/** A basket line to load into the cart, e.g. from the agent. */
export interface BasketItem {
  productId: string
  quantity: number
}

/** An exact copy of a cart line, used to undo a change. */
export interface CartSnapshotItem extends BasketItem {
  origin: LineOrigin
}

// The cart only stores ids, quantities and origin; prices are always read from the catalog.
type CartState = Record<string, { quantity: number; origin: LineOrigin }>

type CartAction =
  | { type: 'add'; productId: string }
  | { type: 'setQuantity'; productId: string; quantity: number }
  | { type: 'remove'; productId: string }
  | { type: 'clear' }
  | { type: 'loadBasket'; items: BasketItem[]; origin: LineOrigin }
  | { type: 'restore'; items: CartSnapshotItem[] }

function without(state: CartState, productId: string): CartState {
  const { [productId]: _removed, ...rest } = state
  return rest
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const line = state[action.productId]
      // A line keeps its original origin: topping up an agent pick doesn't make it a manual one.
      return { ...state, [action.productId]: { quantity: (line?.quantity ?? 0) + 1, origin: line?.origin ?? 'manual' } }
    }
    case 'setQuantity': {
      if (action.quantity <= 0) return without(state, action.productId)
      const line = state[action.productId]
      return { ...state, [action.productId]: { quantity: action.quantity, origin: line?.origin ?? 'manual' } }
    }
    case 'remove':
      return without(state, action.productId)
    case 'clear':
      return {}
    case 'loadBasket': {
      // Replaces the cart. Lines that were already in the cart keep their origin; new ones get `action.origin`.
      const next: CartState = {}
      for (const item of action.items) {
        if (item.quantity <= 0) continue
        next[item.productId] = { quantity: item.quantity, origin: state[item.productId]?.origin ?? action.origin }
      }
      return next
    }
    case 'restore':
      return Object.fromEntries(action.items.map((i) => [i.productId, { quantity: i.quantity, origin: i.origin }]))
  }
}

interface CartContextValue {
  lines: CartLine[]
  itemCount: number
  totalCents: number
  quantityOf: (productId: string) => number
  add: (productId: string) => void
  setQuantity: (productId: string, quantity: number) => void
  remove: (productId: string) => void
  clear: () => void
  /** Replaces the cart with `items`, e.g. the basket the agent built. */
  loadBasket: (items: BasketItem[], origin: LineOrigin, options?: { replaceOrigins?: boolean }) => void
  /** Current lines with their origins, for undo. */
  snapshot: () => CartSnapshotItem[]
  /** Puts the cart back exactly as a snapshot had it (quantities and origins). */
  restore: (items: CartSnapshotItem[]) => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ products, children }: { products: Product[]; children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, {})
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const value = useMemo<CartContextValue>(() => {
    const lines: CartLine[] = Object.entries(state).flatMap(([id, { quantity, origin }]) => {
      const product = productsById.get(id)
      return product ? [{ product, quantity, origin, lineTotalCents: priceInCents(product) * quantity }] : []
    })
    return {
      lines,
      itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
      totalCents: lines.reduce((sum, l) => sum + l.lineTotalCents, 0),
      quantityOf: (productId) => state[productId]?.quantity ?? 0,
      add: (productId) => dispatch({ type: 'add', productId }),
      setQuantity: (productId, quantity) => dispatch({ type: 'setQuantity', productId, quantity }),
      remove: (productId) => dispatch({ type: 'remove', productId }),
      clear: () => dispatch({ type: 'clear' }),
      loadBasket: (items, origin, options) => {
        if (options?.replaceOrigins) dispatch({ type: 'clear' })
        dispatch({ type: 'loadBasket', items, origin })
      },
      snapshot: () => Object.entries(state).map(([productId, { quantity, origin }]) => ({ productId, quantity, origin })),
      restore: (items) => dispatch({ type: 'restore', items }),
    }
  }, [state, productsById])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
