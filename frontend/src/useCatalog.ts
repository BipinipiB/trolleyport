import { useCallback, useEffect, useState } from 'react'
import { fetchCatalog } from './api'
import type { Product } from './catalog'

export type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; products: Product[] }

/**
 * Loads the catalog from the API once on mount.
 * `retry` starts over from the loading screen; `refresh` re-fetches quietly in the background
 * (used after stock changes) so the shop and cart stay on screen.
 */
export function useCatalog(): { state: CatalogState; retry: () => void; refresh: () => Promise<void> } {
  const [state, setState] = useState<CatalogState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchCatalog(controller.signal)
      .then((catalog) => setState({ status: 'ready', products: catalog.products }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })
    return () => controller.abort()
  }, [attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  const refresh = useCallback(async () => {
    const catalog = await fetchCatalog()
    setState({ status: 'ready', products: catalog.products })
  }, [])

  return { state, retry, refresh }
}
