import type { Product } from './catalog'

// Override with VITE_API_BASE_URL in frontend/.env.local if the API runs elsewhere.
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5080'

export interface CatalogResponse {
  currency: string
  products: Product[]
}

// A running-but-hung API should end in an error, not an endless "Loading…".
const REQUEST_TIMEOUT_MS = 10_000

export async function fetchCatalog(signal?: AbortSignal): Promise<CatalogResponse> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/api/catalog`, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (err) {
    if (signal?.aborted) throw err
    if (timeout.aborted) {
      throw new Error(`The Trolleyport API at ${API_BASE_URL} didn't respond within ${REQUEST_TIMEOUT_MS / 1000} seconds.`)
    }
    // fetch only rejects on network failure: API not running, wrong URL, or blocked by CORS.
    throw new Error(`Couldn't reach the Trolleyport API at ${API_BASE_URL}. Is it running?`)
  }
  if (!response.ok) {
    throw new Error(`The API returned an error (${response.status} ${response.statusText}).`)
  }
  return (await response.json()) as CatalogResponse
}

/** The shopper's stated preferences from the agent run, so checkout edits keep respecting them. */
export interface ShoppingPreferences {
  budget: number | null
  diet: string | null
  seekDeals: boolean
  /** Health conditions, allergies or intolerances, e.g. "acid reflux". */
  otherDietaryNeeds: string | null
}

export interface EditBasketResponse {
  basket: { itemId: string; name: string; quantity: number; lineTotal: number }[]
  total: number
  reply: string
  /** What actually changed, computed by the server from the basket before and after. */
  changes: { itemId: string; name: string; before: number; after: number }[]
  toolCalls: { step: number; tool: string; reason: string | null; input: Record<string, unknown>; isError: boolean }[]
  usage: { turns: number; elapsedMs: number }
}

/** One earlier checkout edit, sent so the agent can follow references like "add it back". */
export interface EditHistoryEntry {
  instruction: string
  reply: string
  before: { itemId: string; quantity: number }[]
  after: { itemId: string; quantity: number }[]
}

// The agent may make several Claude calls in a row.
const EDIT_TIMEOUT_MS = 120_000

/** Step 10: asks the agent to change the basket in natural language ("swap the chips for something healthier"). */
export async function editBasket(
  instruction: string,
  basket: { itemId: string; quantity: number }[],
  preferences: ShoppingPreferences | null,
  history: EditHistoryEntry[] = [],
): Promise<EditBasketResponse> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/api/edit-basket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction, basket, preferences, history: history.slice(-5) }),
      signal: AbortSignal.timeout(EDIT_TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') throw new Error('That took too long. Please try again.')
    throw new Error(`Couldn't reach the Trolleyport API at ${API_BASE_URL}. Is it running?`)
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error ?? `The API returned an error (${response.status}).`)
  return body as EditBasketResponse
}

// Demo controls for simulating stock-outs (in memory on the API; reset or restart restores products.json).
export async function setStock(itemId: string, inStock: boolean): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/stock/${encodeURIComponent(itemId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inStock }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Couldn't update stock (${response.status}).`)
}

export async function resetStock(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/stock/reset`, {
    method: 'POST',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Couldn't reset stock (${response.status}).`)
}
