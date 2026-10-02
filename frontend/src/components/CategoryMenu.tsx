import { useEffect, useRef, useState } from 'react'

/** Single-level category flyout for the header: "All products" plus the catalog's top categories. */
export function CategoryMenu({ categories, onSelect }: { categories: string[]; onSelect: (category: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (category: string | null) => {
    onSelect(category)
    setOpen(false)
  }

  return (
    <div className="category-menu" ref={root}>
      <button type="button" className="menu-trigger" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Shop by category <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="menu-panel">
          <li>
            <button type="button" onClick={() => choose(null)}>
              All products
            </button>
          </li>
          {categories.map((c) => (
            <li key={c}>
              <button type="button" onClick={() => choose(c)}>
                {c}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
