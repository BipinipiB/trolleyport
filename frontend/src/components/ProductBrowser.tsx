import { useMemo, useState } from 'react'
import { categoriesOf, type Product } from '../catalog'
import { ProductCard } from './ProductCard'

export const ALL = 'All'

/** The category filter is owned by the page so the header's category menu can drive it too. */
export function ProductBrowser({
  products,
  category,
  onCategoryChange,
}: {
  products: Product[]
  category: string
  onCategoryChange: (category: string) => void
}) {
  const categories = useMemo(() => categoriesOf(products), [products])
  const setCategory = onCategoryChange
  const [vegOnly, setVegOnly] = useState(false)
  const [dealsOnly, setDealsOnly] = useState(false)
  const [search, setSearch] = useState('')

  const term = search.trim().toLowerCase()
  const visible = products.filter(
    (p) =>
      (category === ALL || p.category === category) &&
      (!vegOnly || p.isVegetarian) &&
      (!dealsOnly || p.onDeal) &&
      (term === '' || p.name.toLowerCase().includes(term)),
  )
  const groups = categories
    .map((c) => ({ category: c, items: visible.filter((p) => p.category === c) }))
    .filter((g) => g.items.length > 0)

  return (
    <section className="browser" id="products" aria-label="Products">
      <div className="filters">
        <input
          type="search"
          placeholder="Search products"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search products"
        />
        <div className="chips" role="group" aria-label="Category">
          {[ALL, ...categories].map((c) => (
            <button
              key={c}
              type="button"
              className={c === category ? 'chip active' : 'chip'}
              aria-pressed={c === category}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="toggles">
          <label>
            <input type="checkbox" checked={vegOnly} onChange={(e) => setVegOnly(e.target.checked)} /> Vegetarian only
          </label>
          <label>
            <input type="checkbox" checked={dealsOnly} onChange={(e) => setDealsOnly(e.target.checked)} /> Deals only
          </label>
        </div>
      </div>

      {groups.length === 0 && <p className="empty">No products match these filters.</p>}
      {groups.map((g) => (
        <div key={g.category} className="category-group">
          <h2>
            {g.category} <span className="count">{g.items.length} items</span>
          </h2>
          <div className="grid">
            {g.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      ))}
      <p className="photo-credit">
        Product photos from Pexels photographers · <a href="/products/credits.html">Photo credits</a>
      </p>
    </section>
  )
}
