import { useEffect, useMemo, useState } from 'react'
import { formatCents, priceInCents, savingsPercent, type Product } from '../catalog'
import { useCart } from '../cart'
import { ProductImage } from './ProductImage'

const ADVANCE_MS = 5000
const MAX_SLIDES = 4

/** "Today's best deals" hero: the biggest in-stock savings, auto-advancing every 5s with manual arrows. */
export function DealsCarousel({ products }: { products: Product[] }) {
  const { add, quantityOf } = useCart()
  const deals = useMemo(
    () =>
      products
        .filter((p) => p.inStock && savingsPercent(p) !== null)
        .sort((a, b) => (savingsPercent(b) ?? 0) - (savingsPercent(a) ?? 0))
        .slice(0, MAX_SLIDES),
    [products],
  )
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reducedMotion = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, [])

  useEffect(() => {
    if (paused || reducedMotion || deals.length < 2) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % deals.length), ADVANCE_MS)
    return () => clearInterval(timer)
  }, [paused, reducedMotion, deals.length])

  if (deals.length === 0) return null
  const current = deals[index % deals.length]
  const go = (delta: number) => setIndex((i) => (i + delta + deals.length) % deals.length)

  return (
    <section
      className="hero"
      aria-roledescription="carousel"
      aria-label="Today's best deals"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="hero-slide" aria-roledescription="slide" aria-label={`${index + 1} of ${deals.length}`} key={current.id}>
        <ProductImage product={current} className="hero-image" />
        <div className="hero-copy">
          <p className="eyebrow">Today's best deals</p>
          <span className="deal-pill large">Save {savingsPercent(current)}%</span>
          <h2>{current.name}</h2>
          <p className="hero-price">
            <strong>{formatCents(priceInCents(current))}</strong>
            <span className="was">was {formatCents(Math.round(current.price * 100))}</span>
            <span className="meta"> · {current.unit}</span>
          </p>
          <button type="button" className="primary" onClick={() => add(current.id)}>
            {quantityOf(current.id) > 0 ? `In your trolley (${quantityOf(current.id)}) · add another` : 'Add to trolley'}
          </button>
        </div>
      </div>
      <button type="button" className="hero-arrow prev" aria-label="Previous deal" onClick={() => go(-1)}>
        ‹
      </button>
      <button type="button" className="hero-arrow next" aria-label="Next deal" onClick={() => go(1)}>
        ›
      </button>
      <div className="hero-dots" role="group" aria-label="Choose a deal">
        {deals.map((d, i) => (
          <button
            key={d.id}
            type="button"
            className={i === index % deals.length ? 'dot active' : 'dot'}
            aria-label={`Show ${d.name}`}
            aria-current={i === index % deals.length}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </section>
  )
}
