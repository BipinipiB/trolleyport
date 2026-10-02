import { formatCents } from '../catalog'
import { useCart } from '../cart'

export function CartPanel({ onCheckout }: { onCheckout: () => void }) {
  const { lines, itemCount, totalCents } = useCart()

  return (
    <aside className="cart-panel" aria-label="Cart">
      <h2>
        Your trolley <span className="count">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
      </h2>
      {lines.length === 0 ? (
        <p className="empty">Nothing in here yet. Add a few things, or let Trolleyport do the shop for you.</p>
      ) : (
        <ul className="cart-lines">
          {lines.map((l) => (
            <li key={l.product.id}>
              <span className="line-name">
                {l.quantity} × {l.product.name}
                {l.origin === 'agent' && <span className="picked-tag">picked by Trolleyport</span>}
              </span>
              <span className="line-total">{formatCents(l.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="cart-footer">
        <div className="total">
          <span>Total</span>
          <strong data-testid="cart-total">{formatCents(totalCents)}</strong>
        </div>
        <button type="button" className="primary block" disabled={lines.length === 0} onClick={onCheckout}>
          Go to checkout
        </button>
      </div>
    </aside>
  )
}
