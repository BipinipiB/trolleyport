import { formatCents, priceInCents, savingsPercent, unitPriceLabel, type Product } from '../catalog'
import { useCart } from '../cart'
import { ProductImage } from './ProductImage'
import { QuantityStepper } from './QuantityStepper'

export function ProductCard({ product }: { product: Product }) {
  const { quantityOf, add, setQuantity } = useCart()
  const quantity = quantityOf(product.id)
  const saving = savingsPercent(product)
  const unitPrice = unitPriceLabel(product)

  return (
    <article className={product.inStock ? 'product-card' : 'product-card out-of-stock'}>
      <div className="card-media">
        <ProductImage product={product} className="card-image" />
        {saving !== null && <span className="deal-pill">Save {saving}%</span>}
        {!product.inStock && <span className="badge oos">Out of stock</span>}
      </div>
      <div className="card-body">
        <h3>{product.name}</h3>
        <p className="meta">
          {product.unit}
          <span className={product.isVegetarian ? 'diet-tag veg' : 'diet-tag nonveg'}>
            {product.isVegetarian ? 'Veg' : 'Non-veg'}
          </span>
        </p>
        <p className="price">
          <strong>{formatCents(priceInCents(product))}</strong>
          {product.onDeal && <s>{formatCents(Math.round(product.price * 100))}</s>}
        </p>
        {unitPrice && <p className="unit-price">{unitPrice}</p>}
        {product.inStock && <p className="stock">In stock</p>}
        <div className="card-action">
          {quantity === 0 ? (
            <button type="button" className="primary" disabled={!product.inStock} onClick={() => add(product.id)}>
              {product.inStock ? 'Add to cart' : 'Unavailable'}
            </button>
          ) : (
            <QuantityStepper quantity={quantity} label={product.name} onChange={(q) => setQuantity(product.id, q)} />
          )}
        </div>
      </div>
    </article>
  )
}
