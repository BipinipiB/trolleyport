import { useEffect, useRef, useState } from 'react'
import { API_BASE_URL, type ShoppingPreferences } from './api'
import { CartProvider, useCart } from './cart'
import { categoriesOf, formatCents, type Product } from './catalog'
import { CartPanel } from './components/CartPanel'
import { CategoryMenu } from './components/CategoryMenu'
import { Checkout } from './components/Checkout'
import { DealsCarousel } from './components/DealsCarousel'
import { ALL, ProductBrowser } from './components/ProductBrowser'
import { StockSimulator } from './components/StockSimulator'
import { useCatalog } from './useCatalog'
import type { BasketResponse, DoMyShoppingButton } from './web-components/do-my-shopping-button'

type View = 'browse' | 'checkout'

function Shop({ products, onStockChanged }: { products: Product[]; onStockChanged: () => Promise<void> }) {
  const [view, setView] = useState<View>('browse')
  // Bumped whenever the agent loads a basket, so checkout starts fresh (e.g. after a previous "Order placed").
  const [checkoutKey, setCheckoutKey] = useState(0)
  // The preferences behind the last agent basket, so checkout edits keep respecting the budget and diet.
  const [preferences, setPreferences] = useState<ShoppingPreferences | null>(null)
  const { itemCount, totalCents, loadBasket } = useCart()
  const shoppingButton = useRef<DoMyShoppingButton>(null)
  const [category, setCategory] = useState(ALL)

  // Step 9: when the agent finishes a basket, put exactly those items in the real cart and go to checkout.
  useEffect(() => {
    const element = shoppingButton.current
    if (!element) return
    const onBasket = (event: Event) => {
      const result = (event as CustomEvent<BasketResponse>).detail
      loadBasket(result.basket.map((line) => ({ productId: line.itemId, quantity: line.quantity })), 'agent', { replaceOrigins: true })
      setPreferences(result.preferences)
      setCheckoutKey((k) => k + 1)
      setView('checkout')
    }
    element.addEventListener('dms-basket', onBasket)
    return () => element.removeEventListener('dms-basket', onBasket)
  }, [loadBasket])

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <button type="button" className="brand" onClick={() => setView('browse')}>
            <Logo />
            Trolleyport
          </button>
          <CategoryMenu
            categories={categoriesOf(products)}
            onSelect={(c) => {
              setCategory(c ?? ALL)
              setView('browse')
              requestAnimationFrame(() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' }))
            }}
          />
          <div className="header-actions">
            <do-my-shopping-button ref={shoppingButton} label="Do my shopping" api-base={API_BASE_URL} />
            <button
              type="button"
              className="cart-button"
              aria-label={`Cart: ${itemCount} ${itemCount === 1 ? 'item' : 'items'}, ${formatCents(totalCents)}`}
              onClick={() => setView('checkout')}
            >
              <CartIcon />
              <span className="cart-count">{itemCount}</span>
              <span className="cart-total">{formatCents(totalCents)}</span>
            </button>
          </div>
        </div>
      </header>
      <main>
        {view === 'browse' ? (
          <div className="browse-layout">
            <div>
              <DealsCarousel products={products} />
              <ProductBrowser products={products} category={category} onCategoryChange={setCategory} />
              <StockSimulator products={products} onChanged={onStockChanged} />
            </div>
            <CartPanel onCheckout={() => setView('checkout')} />
          </div>
        ) : (
          <Checkout key={checkoutKey} products={products} preferences={preferences} onBack={() => setView('browse')} />
        )}
      </main>
    </>
  )
}

export default function App() {
  const { state, retry, refresh } = useCatalog()

  if (state.status === 'ready') {
    return (
      <CartProvider products={state.products}>
        <Shop products={state.products} onStockChanged={refresh} />
      </CartProvider>
    )
  }

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <span className="brand">
            <Logo />
            Trolleyport
          </span>
        </div>
      </header>
      <main>
        {state.status === 'loading' ? (
          <p className="status" role="status">
            Loading products…
          </p>
        ) : (
          <div className="status error" role="alert">
            <h1>Can't load the shop</h1>
            <p>{state.message}</p>
            <button type="button" className="primary" onClick={retry}>
              Try again
            </button>
          </div>
        )}
      </main>
    </>
  )
}

/** Original trolley mark (not based on any retailer's logo). */
function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#FAF9F6" />
      <path d="M7 10h3l2.5 10h10l2.5-7H11.5" fill="none" stroke="#0F5257" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="13.5" cy="24" r="1.8" fill="#0F5257" />
      <circle cx="21.5" cy="24" r="1.8" fill="#0F5257" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg className="cart-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 5h2.5l2 10h10l2-7H7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.5" cy="19" r="1.5" fill="currentColor" />
      <circle cx="16.5" cy="19" r="1.5" fill="currentColor" />
    </svg>
  )
}
