import { useState } from 'react'
import { editBasket, type EditBasketResponse, type EditHistoryEntry, type ShoppingPreferences } from '../api'
import { useCart, type CartSnapshotItem } from '../cart'

const toItems = (snapshot: { productId: string; quantity: number }[]) =>
  snapshot.map((l) => ({ itemId: l.productId, quantity: l.quantity }))

/**
 * Step 10: a conversational edit box at checkout. Sends the current cart, the shopper's request and the recent edit
 * history to the agent, then loads the agent's updated basket back into the cart. Always shown (even when the cart
 * is empty) so replies are never lost and "add it back" style requests are possible.
 */
export function BasketEditor({ preferences }: { preferences: ShoppingPreferences | null }) {
  const { loadBasket, snapshot, restore } = useCart()
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<{ instruction: string; result: EditBasketResponse } | null>(null)
  // What has happened in this checkout session, oldest first (sent to the agent for context).
  const [history, setHistory] = useState<EditHistoryEntry[]>([])
  // Cart states before each agent edit, newest last (for the Undo button; no AI involved).
  const [undoStack, setUndoStack] = useState<CartSnapshotItem[][]>([])

  async function submit() {
    const text = instruction.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    const before = snapshot()
    try {
      const result = await editBasket(text, toItems(before), preferences, history)
      console.info('[edit-basket]', text, result)
      // Lines already in the cart keep their origin; anything new the agent added is tagged as an agent pick.
      loadBasket(result.basket.map((l) => ({ productId: l.itemId, quantity: l.quantity })), 'agent')
      setLast({ instruction: text, result })
      setHistory((h) => [
        ...h,
        { instruction: text, reply: result.reply, before: toItems(before), after: result.basket.map((l) => ({ itemId: l.itemId, quantity: l.quantity })) },
      ])
      if (result.changes.length > 0) setUndoStack((s) => [...s, before])
      setInstruction('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function undo() {
    const previous = undoStack.at(-1)
    if (!previous || busy) return
    const current = snapshot()
    restore(previous)
    setUndoStack((s) => s.slice(0, -1))
    // Keep the agent's picture of events accurate if the shopper asks for something else afterwards.
    setHistory((h) => [
      ...h,
      { instruction: '(shopper pressed Undo)', reply: 'Restored the basket from before the last change.', before: toItems(current), after: toItems(previous) },
    ])
    setLast(null)
  }

  return (
    <section className="basket-editor" aria-label="Ask Trolleyport to change your basket">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label htmlFor="basket-edit">Want to change something? Just ask.</label>
        <div className="editor-row">
          <input
            id="basket-edit"
            type="text"
            maxLength={1000}
            placeholder={'e.g. "swap the chips for something healthier" or "I\'ve got $10 left, add snacks"'}
            value={instruction}
            disabled={busy}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <button type="submit" className="primary" disabled={busy || !instruction.trim()}>
            {busy ? 'Updating…' : 'Ask'}
          </button>
        </div>
      </form>

      {busy && (
        <p className="status" role="status">
          Trolleyport is updating your basket…
        </p>
      )}
      {error && (
        <p className="sim-error" role="alert">
          {error}
        </p>
      )}

      {last && !busy && (
        <div className="edit-result" aria-live="polite">
          <p className="edit-request">“{last.instruction}”</p>
          <p className="edit-reply">{last.result.reply}</p>
          {last.result.changes.length === 0 ? (
            <p className="unit">No changes were made to your basket.</p>
          ) : (
            <ul className="edit-changes">
              {last.result.changes.map((c) => (
                <li key={c.itemId}>
                  {c.before === 0
                    ? `Added ${c.after} × ${c.name}`
                    : c.after === 0
                      ? `Removed ${c.name}`
                      : `${c.name}: ${c.before} → ${c.after}`}
                </li>
              ))}
            </ul>
          )}
          <details>
            <summary>How Trolleyport did it ({last.result.toolCalls.length} tool calls)</summary>
            <ol>
              {last.result.toolCalls.map((call) => (
                <li key={call.step}>
                  <code>
                    {call.tool}({Object.values(call.input).map(String).join(', ')})
                  </code>
                  {call.isError && <span className="sim-error"> refused</span>}
                  {call.reason && <span className="unit"> — {call.reason}</span>}
                </li>
              ))}
            </ol>
          </details>
        </div>
      )}

      {undoStack.length > 0 && !busy && (
        <button type="button" className="link undo" onClick={undo}>
          ↶ Undo last change
        </button>
      )}
    </section>
  )
}
