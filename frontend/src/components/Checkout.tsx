import { useState } from 'react'
import type { ShoppingPreferences } from '../api'
import { formatCents, priceInCents, unitPriceLabel, type Product } from '../catalog'
import { useCart } from '../cart'
import { BasketEditor } from './BasketEditor'
import { ProductImage } from './ProductImage'
import { QuantityStepper } from './QuantityStepper'

export function Checkout({
  products,
  preferences,
  onBack,
}: {
  products: Product[]
  preferences: ShoppingPreferences | null
  onBack: () => void
}) {
  const { lines, itemCount, totalCents, add, setQuantity, remove, clear } = useCart()
  const [placedTotal, setPlacedTotal] = useState<number | null>(null)
  const [toAdd, setToAdd] = useState('')
  const inCart = new Set(lines.map((l) => l.product.id))
  const addable = products.filter((p) => p.inStock && !inCart.has(p.id))
  const agentPicked = lines.filter((l) => l.origin === 'agent').length

  if (placedTotal !== null) {
    return (
      <section className="checkout">
        <h1>Order placed — sweet as!</h1>
        <p>Thanks! This is a demo, so nothing was charged. Order total: {formatCents(placedTotal)}.</p>
        <button type="button" className="primary" onClick={onBack}>
          Back to shopping
        </button>
      </section>
    )
  }

  return (
    <section className="checkout">
      <button type="button" className="link" onClick={onBack}>
        ← Keep shopping
      </button>
      <div className="checkout-layout">
        <div className="checkout-main">
          <div className="checkout-head">
            <h1>Checkout</h1>
            {agentPicked > 0 && (
              <p className="meta">
                Trolleyport picked {agentPicked} of these. Change anything you like — it's your shop.
              </p>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="empty">Your trolley's empty. Head back and grab a few things.</p>
          ) : (
            <ul className="checkout-lines">
              {lines.map((l) => (
                <li key={l.product.id} className="checkout-line">
                  <ProductImage product={l.product} className="line-thumb" />
                  <div className="line-info">
                    <span className="line-name">
                      {l.product.name}
                      {l.origin === 'agent' && <span className="picked-tag">picked by Trolleyport</span>}
                    </span>
                    <span className="meta">
                      {l.product.unit} · {formatCents(priceInCents(l.product))}
                      {unitPriceLabel(l.product) ? ` · ${unitPriceLabel(l.product)}` : ''}
                    </span>
                  </div>
                  <QuantityStepper quantity={l.quantity} label={l.product.name} onChange={(q) => setQuantity(l.product.id, q)} />
                  <span className="line-subtotal">{formatCents(l.lineTotalCents)}</span>
                  <button
                    type="button"
                    className="link remove"
                    aria-label={`Remove ${l.product.name}`}
                    onClick={() => remove(l.product.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="add-item"
            onSubmit={(e) => {
              e.preventDefault()
              if (!toAdd) return
              add(toAdd)
              setToAdd('')
            }}
          >
            <label htmlFor="checkout-add">Forgot something?</label>
            <select id="checkout-add" value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
              <option value="">Choose a product…</option>
              {addable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatCents(priceInCents(p))})
                </option>
              ))}
            </select>
            <button type="submit" className="secondary" disabled={!toAdd}>
              Add
            </button>
          </form>
        </div>

        {/* On wide screens this is a sticky side panel; on narrow ones it follows the items. */}
        <aside className="checkout-side" aria-label="Order summary">
          <div className="checkout-footer">
            <div className="footer-total">
              <span>
                Total · {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
              <strong data-testid="checkout-total">{formatCents(totalCents)}</strong>
            </div>
            <button
              type="button"
              className="primary"
              disabled={lines.length === 0}
              onClick={() => {
                setPlacedTotal(totalCents)
                clear()
              }}
            >
              Place order
            </button>
          </div>
          <BasketEditor preferences={preferences} />
        </aside>
      </div>
    </section>
  )
}
