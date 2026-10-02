import { useState } from 'react'
import { resetStock, setStock } from '../api'
import type { Product } from '../catalog'

/** Demo-only panel for simulating items selling out, so the agent's swap/skip behaviour can be tried. */
export function StockSimulator({ products, onChanged }: { products: Product[]; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const outCount = products.filter((p) => !p.inStock).length

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="stock-sim">
      <summary>
        Demo: simulate stock-outs <span className="count">({outCount} out of stock)</span>
      </summary>
      <p className="unit">
        Untick an item to mark it out of stock, then try "Do my shopping". Changes last until you reset or the API restarts.
      </p>
      {error && (
        <p className="sim-error" role="alert">
          {error}
        </p>
      )}
      <div className="sim-grid" aria-busy={busy}>
        {products.map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              checked={p.inStock}
              disabled={busy}
              onChange={(e) => run(() => setStock(p.id, e.target.checked))}
            />{' '}
            {p.name}
          </label>
        ))}
      </div>
      <button type="button" className="link" disabled={busy || outCount === 0} onClick={() => run(resetStock)}>
        Reset all to in stock
      </button>
    </details>
  )
}
