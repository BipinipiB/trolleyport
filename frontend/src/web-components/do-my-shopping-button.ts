// <do-my-shopping-button> — a native Custom Element, deliberately framework-free so it can be
// embedded in any page (React, another framework, or plain HTML). Do not import React here.
//
// Usage:
//   <script type="module" src=".../do-my-shopping-button.js"></script>
//   <do-my-shopping-button api-base="https://api.example.com"></do-my-shopping-button>
//
// Attributes:  label     – button text (default "Do my shopping")
//              api-base  – base URL of the Trolleyport API (default: same origin)
// Methods:     open(), close()
// Events:      dms-open, dms-close, dms-parsed (detail: the parse response),
//              dms-basket (detail: the build-basket response)
//              All bubble and cross the shadow boundary. dms-close fires just after the dialog closes.
// Theming:     --dms-accent, --dms-accent-text, --dms-radius on the host element

const TAG_NAME = 'do-my-shopping-button'
const DEFAULT_LABEL = 'Do my shopping'
const REQUEST_TIMEOUT_MS = 60_000
// The agent makes several Claude calls in a row, so it gets longer.
const BASKET_TIMEOUT_MS = 180_000
const REQUEST_PLACEHOLDER = "e.g. Sort the weekly shop for two – under $100, we're vegetarian, and grab any specials"

/** Response from POST /api/parse-request. */
export interface ParseResponse {
  status: 'parsed' | 'needs_clarification'
  parsed: { budget: number | null; diet: string | null; seekDeals: boolean; otherDietaryNeeds: string | null }
  clarifyingQuestion: string | null
  model: Record<string, unknown>
  usage: { inputTokens: number; outputTokens: number; elapsedMs: number }
}

interface FollowUp {
  question: string
  answer: string
}

/** Response from POST /api/build-basket. */
export interface BasketResponse {
  basket: { itemId: string; name: string; unit: string; quantity: number; unitPrice: number; lineTotal: number; onDeal: boolean }[]
  /** Usual items Claude swapped or skipped (out of stock, budget, diet), with its reason. */
  changes: {
    originalItemId: string
    originalName: string
    decision: 'substituted' | 'skipped'
    replacementItemId: string | null
    replacementName: string | null
    reason: string
  }[]
  total: number
  /** null when the shopper said there is no budget. */
  budget: number | null
  /** The preferences this basket was built for (budget, diet, deals). */
  preferences: { budget: number | null; diet: string | null; seekDeals: boolean; otherDietaryNeeds: string | null }
  explanation: {
    headline: string
    kept: string
    keptItems: string[]
    swaps: { itemId: string; original: string; replacement: string; sentence: string; fallback: boolean }[]
    drops: { itemId: string; name: string; evidence: string[]; sentence: string; fallback: boolean }[]
  }
  /** The agent's own closing message; kept for debugging, not shown (the explanation above is checked). */
  agentNotes: string
  toolCalls: {
    step: number
    turn: number
    tool: string
    reason: string | null
    input: Record<string, unknown>
    result: Record<string, any>
    isError: boolean
  }[]
  usage: { turns: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; elapsedMs: number }
}

const nzd = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })

/** One-line description of a tool result for the trail. */
function describeResult(call: BasketResponse['toolCalls'][number]): string {
  const r = call.result
  if (call.isError) return `Refused: ${r.error}`
  switch (call.tool) {
    case 'check_history':
      return `${r.orders?.length ?? 0} past orders`
    case 'search_deals':
      return `${r.deals?.length ?? 0} items on deal`
    case 'check_stock':
      return r.inStock ? `${r.name}: in stock, ${nzd.format(r.currentPrice)}` : `${r.name}: OUT OF STOCK`
    case 'add_to_basket':
      return `Basket ${nzd.format(r.basketTotal)}, ${nzd.format(r.remainingBudget)} left`
    case 'browse_catalog':
      return `${r.items?.length ?? 0} items listed`
    case 'record_change':
      return `Recorded: ${r.recorded}`
    default:
      return JSON.stringify(r)
  }
}

const DIET_LABELS: Record<string, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  no_restriction: 'No restriction',
}

const template = document.createElement('template')
template.innerHTML = `
  <style>
    :host {
      /* Trigger button colours (the host can invert these to sit on a coloured header). */
      --_accent: var(--dms-accent, #0f5257);
      --_accent-text: var(--dms-accent-text, #ffffff);
      /* Colours inside the dialog. Coral is reserved for deals. */
      --_brand: var(--dms-brand, #0f5257);
      --_deal: var(--dms-deal, #ff6b4a);
      --_radius: var(--dms-radius, 8px);
      --_surface: #fffdf9;
      --_subtle: #e3eeee;
      --_text: #1a1a1a;
      --_muted: #6b6b6b;
      --_border: #e6e1d8;
      --_danger: #1a1a1a;
      display: inline-block;
      font-family: var(--dms-font-body, 'Inter', system-ui, sans-serif);
    }
    h2,
    h3 {
      font-family: var(--dms-font-heading, 'Poppins', system-ui, sans-serif);
      font-weight: 600;
    }
    button {
      font: inherit;
      cursor: pointer;
    }
    button:disabled {
      cursor: progress;
      opacity: 0.6;
    }
    button:focus-visible,
    textarea:focus-visible {
      outline: 2px solid var(--_brand);
      outline-offset: 2px;
    }
    .trigger,
    .submit,
    .action {
      font-weight: 600;
      border: none;
      border-radius: var(--_radius);
      padding: 8px 16px;
      min-height: 40px;
      background: var(--_brand);
      color: #fff;
      white-space: nowrap;
    }
    .trigger {
      background: var(--_accent);
      color: var(--_accent-text);
    }
    dialog {
      width: min(520px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      overflow: auto;
      padding: 0;
      border: 1px solid var(--_border);
      border-radius: 12px;
      background: var(--_surface);
      color: var(--_text);
      box-shadow: 0 16px 48px rgb(26 26 26 / 0.25);
    }
    dialog::backdrop {
      background: rgb(15 82 87 / 0.45);
    }
    .panel {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 24px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    h2 {
      margin: 0;
      font-size: 1.15rem;
    }
    p {
      margin: 0;
      line-height: 1.45;
    }
    .muted {
      color: var(--_muted);
    }
    .close {
      font-size: 1.25rem;
      line-height: 1;
      border: none;
      background: none;
      color: var(--_muted);
      width: 32px;
      height: 32px;
      border-radius: 6px;
    }
    .transcript {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .transcript li {
      padding: 8px 10px;
      border-radius: 8px;
      max-width: 90%;
      line-height: 1.4;
      white-space: pre-wrap;
    }
    .transcript .you {
      align-self: flex-end;
      background: var(--_brand);
      color: #fff;
    }
    .transcript .assistant {
      align-self: flex-start;
      background: var(--_subtle);
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    label {
      font-weight: 600;
      font-size: 0.9rem;
    }
    textarea {
      font: inherit;
      min-height: 64px;
      resize: vertical;
      padding: 8px 10px;
      border: 1px solid var(--_border);
      border-radius: 8px;
      background: var(--_surface);
      color: var(--_text);
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .link {
      border: none;
      background: none;
      padding: 0;
      color: var(--_brand);
      text-decoration: underline;
    }
    .error {
      color: var(--_danger);
      font-weight: 600;
      padding: 8px 16px;
      border-left: 4px solid var(--_text);
      background: #f2efe9;
      border-radius: 4px;
    }
    .result {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 16px;
      margin: 0;
      padding: 12px;
      border: 1px solid var(--_border);
      border-radius: 8px;
    }
    .result dt {
      color: var(--_muted);
    }
    .result dd {
      margin: 0;
      font-weight: 600;
    }
    .outcome .note {
      margin-top: 8px;
      font-size: 0.85rem;
    }
    details {
      font-size: 0.85rem;
      color: var(--_muted);
    }
    pre {
      margin: 8px 0 0;
      padding: 8px;
      overflow: auto;
      max-height: 200px;
      border-radius: 6px;
      background: var(--_subtle);
      color: var(--_text);
      font-size: 0.8rem;
    }
    .build {
      align-self: flex-start;
    }
    .basket {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .basket ul {
      margin: 0;
      padding: 0;
      list-style: none;
      border: 1px solid var(--_border);
      border-radius: 8px;
    }
    .basket li {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 10px;
      border-bottom: 1px solid var(--_border);
      font-size: 0.9rem;
    }
    .basket li:last-child {
      border-bottom: none;
    }
    .basket .deal {
      margin-left: 8px;
      padding: 0 8px;
      border-radius: 999px;
      background: var(--_deal);
      color: var(--_text);
      font-size: 0.75rem;
      font-weight: 700;
    }
    .basket .total {
      display: flex;
      justify-content: space-between;
      font-weight: 600;
    }
    .basket .headline {
      font-weight: 600;
    }
    .handoff {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 0.9rem;
    }
    .explain {
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-size: 0.9rem;
    }
    .explain h3 {
      margin: 0 0 6px;
      font-size: 0.95rem;
    }
    .explain li {
      flex-direction: column;
      gap: 2px;
    }
    .explain .what {
      font-weight: 600;
    }
    .explain .why {
      color: var(--_muted);
    }
    .trail ol {
      margin: 8px 0 0;
      padding-left: 22px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      color: var(--_text);
    }
    .trail code {
      font-size: 0.8rem;
      font-weight: 600;
    }
    .trail .why {
      display: block;
      color: var(--_muted);
    }
    .trail .refused {
      color: var(--_danger);
    }
    [hidden] {
      display: none !important;
    }
  </style>
  <button class="trigger" type="button" part="button" aria-haspopup="dialog"></button>
  <dialog part="dialog" aria-labelledby="dms-title">
    <div class="panel">
      <header>
        <h2 id="dms-title">Do my shopping</h2>
        <button class="close" type="button" aria-label="Close">&times;</button>
      </header>
      <p class="muted intro">Kia ora! Tell me what you need this week: a budget, any dietary needs, and whether I should hunt out the specials. I'll sort the trolley.</p>
      <ul class="transcript" aria-live="polite"></ul>
      <div class="outcome" hidden>
        <dl class="result">
          <dt>Budget</dt><dd data-field="budget"></dd>
          <dt>Diet</dt><dd data-field="diet"></dd>
          <dt>Other dietary needs</dt><dd data-field="other"></dd>
          <dt>Find deals</dt><dd data-field="deals"></dd>
        </dl>
        <p class="muted note" hidden>Heads up: I'll pick foods using general knowledge, not medical advice or full ingredient lists. Please double-check labels, especially for allergies.</p>
      </div>
      <button class="action build" type="button" hidden>Fill my trolley</button>
      <p class="muted building" role="status" hidden>Filling your trolley… this usually takes 15–30 seconds.</p>
      <section class="basket" aria-label="Basket" hidden>
        <p class="headline"></p>
        <div class="handoff">
          <span class="muted">All in your trolley. Tweak anything you like at checkout.</span>
          <button class="action to-checkout" type="button">Review at checkout</button>
        </div>
        <ul class="lines"></ul>
        <div class="total"><span>Total</span><span data-field="total"></span></div>
        <div class="explain">
          <p class="kept"></p>
          <div class="swaps" hidden>
            <h3>Swapped</h3>
            <ul></ul>
          </div>
          <div class="drops" hidden>
            <h3>Dropped</h3>
            <ul></ul>
          </div>
        </div>
        <details class="trail">
          <summary>How Claude built this (<span data-field="calls"></span> tool calls)</summary>
          <ol></ol>
        </details>
      </section>
      <p class="error" role="alert" hidden></p>
      <form>
        <label for="dms-input">What are we shopping for?</label>
        <textarea id="dms-input" name="text" maxlength="1000"></textarea>
        <div class="row">
          <button class="link restart" type="button" hidden>Start over</button>
          <span></span>
          <button class="submit" type="submit">Let's go</button>
        </div>
      </form>
      <details class="debug" hidden>
        <summary>Parsed output (for checking)</summary>
        <pre></pre>
      </details>
    </div>
  </dialog>
`

export class DoMyShoppingButton extends HTMLElement {
  static observedAttributes = ['label']

  readonly #root: ShadowRoot
  readonly #trigger: HTMLButtonElement
  readonly #dialog: HTMLDialogElement
  readonly #form: HTMLFormElement
  readonly #input: HTMLTextAreaElement
  readonly #inputLabel: HTMLLabelElement
  readonly #submit: HTMLButtonElement

  // Conversation state: the original request plus any clarifying questions already answered.
  #request: string | null = null
  #followUps: FollowUp[] = []
  #pendingQuestion: string | null = null
  #parsed: ParseResponse['parsed'] | null = null
  #inFlight: AbortController | null = null

  constructor() {
    super()
    this.#root = this.attachShadow({ mode: 'open' })
    this.#root.append(template.content.cloneNode(true))

    this.#trigger = this.#$('.trigger')
    this.#dialog = this.#$('dialog')
    this.#form = this.#$('form')
    this.#input = this.#$('textarea')
    this.#inputLabel = this.#$('label')
    this.#submit = this.#$('form .submit')

    this.#trigger.addEventListener('click', () => this.open())
    this.#$('.close').addEventListener('click', () => this.close())
    this.#$('.restart').addEventListener('click', () => this.#reset())
    this.#$('.build').addEventListener('click', () => void this.#buildBasket())
    // The host page loads the basket into its cart on dms-basket; this just gets the popup out of the way.
    this.#$('.to-checkout').addEventListener('click', () => this.close())
    // A click whose target is the <dialog> itself landed on the backdrop, outside the panel.
    this.#dialog.addEventListener('click', (e) => {
      if (e.target === this.#dialog) this.close()
    })
    // Fires for the close button, backdrop click, and the Escape key alike.
    this.#dialog.addEventListener('close', () => {
      this.dispatchEvent(new CustomEvent('dms-close', { bubbles: true, composed: true }))
    })
    this.#form.addEventListener('submit', (e) => {
      e.preventDefault()
      void this.#send()
    })
    // Enter sends; Shift+Enter adds a new line.
    this.#input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault()
        this.#form.requestSubmit()
      }
    })
    this.#input.placeholder = REQUEST_PLACEHOLDER
    this.#renderLabel()
  }

  attributeChangedCallback() {
    this.#renderLabel()
  }

  disconnectedCallback() {
    this.#inFlight?.abort()
    // Don't leave an orphaned modal (and its page-blocking backdrop) behind.
    if (this.#dialog.open) this.#dialog.close()
  }

  get isOpen(): boolean {
    return this.#dialog.open
  }

  open(): void {
    if (this.#dialog.open || !this.isConnected) return
    this.#dialog.showModal()
    this.#input.focus()
    this.dispatchEvent(new CustomEvent('dms-open', { bubbles: true, composed: true }))
  }

  close(): void {
    if (this.#dialog.open) this.#dialog.close()
  }

  async #send(): Promise<void> {
    const text = this.#input.value.trim()
    if (!text || this.#inFlight) return

    if (this.#pendingQuestion) this.#followUps.push({ question: this.#pendingQuestion, answer: text })
    else this.#request = text
    this.#pendingQuestion = null

    this.#addBubble('you', text)
    this.#input.value = ''
    this.#showError(null)
    this.#setBusy(true)

    const controller = new AbortController()
    this.#inFlight = controller
    const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${this.#apiBase}/api/parse-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: this.#request, followUps: this.#followUps }),
        signal: controller.signal,
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error ?? `The server returned ${response.status}.`)
      this.#showResult(body as ParseResponse)
    } catch (err) {
      const cancelled = controller.signal.aborted &&
        !(controller.signal.reason instanceof DOMException && controller.signal.reason.name === 'TimeoutError')
      if (cancelled) return // "Start over" already cleared everything
      // Undo this turn so the shopper can edit and resend it.
      if (this.#followUps.length && this.#request) this.#pendingQuestion = this.#followUps.pop()!.question
      else this.#request = null
      this.#root.querySelector('.transcript li:last-child')?.remove()
      this.#input.value = text
      const timedOut = controller.signal.reason instanceof DOMException && controller.signal.reason.name === 'TimeoutError'
      this.#showError(
        timedOut
          ? 'That took a bit too long. Mind giving it another go?'
          : err instanceof TypeError
            ? `Couldn't reach the Trolleyport API at ${this.#apiBase || window.location.origin}.`
            : err instanceof Error
              ? err.message
              : String(err),
      )
    } finally {
      clearTimeout(timer)
      this.#inFlight = null
      this.#setBusy(false)
      this.#syncForm()
    }
  }

  #showResult(result: ParseResponse): void {
    console.info('[do-my-shopping] parse-request result', result)
    this.#$('.debug pre').textContent = JSON.stringify(result, null, 2)
    this.#$<HTMLDetailsElement>('.debug').hidden = false

    if (result.status === 'needs_clarification' && result.clarifyingQuestion) {
      this.#pendingQuestion = result.clarifyingQuestion
      this.#addBubble('assistant', result.clarifyingQuestion)
      this.#$('.outcome').hidden = true
    } else {
      const { budget, diet, seekDeals, otherDietaryNeeds } = result.parsed
      this.#$('[data-field="budget"]').textContent =
        budget === null ? 'No limit' : new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(budget)
      this.#$('[data-field="diet"]').textContent = diet === null ? 'Not specified' : (DIET_LABELS[diet] ?? diet)
      this.#$('[data-field="other"]').textContent = otherDietaryNeeds ?? 'None mentioned'
      // false covers both "didn't mention deals" and "said not to bother", so avoid a bare "No".
      this.#$('[data-field="deals"]').textContent = seekDeals ? 'Yes' : 'Not requested'
      this.#$('.outcome .note').hidden = !otherDietaryNeeds
      this.#addBubble('assistant', "Choice, here's what I've got:")
      this.#$('.outcome').hidden = false
      this.#parsed = result.parsed
      this.#$('.build').hidden = false
    }
    this.dispatchEvent(new CustomEvent('dms-parsed', { detail: result, bubbles: true, composed: true }))
  }

  async #buildBasket(): Promise<void> {
    if (!this.#parsed || this.#inFlight) return
    const build = this.#$<HTMLButtonElement>('.build')
    build.hidden = true
    this.#$('.building').hidden = false
    this.#showError(null)

    const controller = new AbortController()
    this.#inFlight = controller
    const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), BASKET_TIMEOUT_MS)
    try {
      const response = await fetch(`${this.#apiBase}/api/build-basket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.#parsed),
        signal: controller.signal,
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error ?? `The server returned ${response.status}.`)
      this.#showBasket(body as BasketResponse)
    } catch (err) {
      const timedOut = controller.signal.reason instanceof DOMException && controller.signal.reason.name === 'TimeoutError'
      if (controller.signal.aborted && !timedOut) return // cancelled by "Start over"
      build.hidden = false
      build.textContent = 'Give it another go'
      this.#showError(
        timedOut
          ? 'Filling the trolley took a bit too long. Mind giving it another go?'
          : err instanceof TypeError
            ? `Couldn't reach the Trolleyport API at ${this.#apiBase || window.location.origin}.`
            : err instanceof Error
              ? err.message
              : String(err),
      )
    } finally {
      clearTimeout(timer)
      this.#inFlight = null
      this.#$('.building').hidden = true
    }
  }

  #showBasket(result: BasketResponse): void {
    console.info('[do-my-shopping] build-basket result', result)
    console.table(result.toolCalls.map((c) => ({ step: c.step, turn: c.turn, tool: c.tool, input: JSON.stringify(c.input), reason: c.reason, error: c.isError })))

    const list = this.#$('.basket .lines')
    list.replaceChildren(
      ...result.basket.map((line) => {
        const li = document.createElement('li')
        const name = document.createElement('span')
        name.textContent = `${line.quantity} × ${line.name}`
        if (line.onDeal) {
          const tag = document.createElement('span')
          tag.className = 'deal'
          tag.textContent = 'DEAL'
          name.append(tag)
        }
        const price = document.createElement('span')
        price.textContent = nzd.format(line.lineTotal)
        li.append(name, price)
        return li
      }),
    )
    this.#$('[data-field="total"]').textContent =
      result.budget === null ? nzd.format(result.total) : `${nzd.format(result.total)} of ${nzd.format(result.budget)}`
    // Step 8 explanation: every swap/drop here is one that actually happened in this run (checked server-side).
    const { explanation } = result
    this.#$('.basket .headline').textContent = explanation.headline
    this.#$('.explain .kept').textContent = explanation.kept
    const fill = (selector: string, rows: { title: string; sentence: string }[]) => {
      this.#$(selector).hidden = rows.length === 0
      this.#$(`${selector} ul`).replaceChildren(
        ...rows.map((row) => {
          const li = document.createElement('li')
          const what = document.createElement('span')
          what.className = 'what'
          what.textContent = row.title
          const why = document.createElement('span')
          why.className = 'why'
          why.textContent = row.sentence
          li.append(what, why)
          return li
        }),
      )
    }
    fill('.explain .swaps', explanation.swaps.map((s) => ({ title: `${s.original} → ${s.replacement}`, sentence: s.sentence })))
    fill('.explain .drops', explanation.drops.map((d) => ({ title: d.name, sentence: d.sentence })))
    this.#$('[data-field="calls"]').textContent = String(result.toolCalls.length)
    this.#$('.trail ol').replaceChildren(
      ...result.toolCalls.map((call) => {
        const li = document.createElement('li')
        const code = document.createElement('code')
        const args = Object.values(call.input).map(String).join(', ')
        code.textContent = `${call.tool}(${args})`
        const outcome = document.createElement('span')
        outcome.className = call.isError ? 'refused' : ''
        outcome.textContent = ` → ${describeResult(call)}`
        const why = document.createElement('span')
        why.className = 'why'
        why.textContent = call.reason ?? ''
        li.append(code, outcome, why)
        return li
      }),
    )
    this.#$('.debug pre').textContent = JSON.stringify(result, null, 2)
    this.#$('.basket').hidden = false
    this.dispatchEvent(new CustomEvent('dms-basket', { detail: result, bubbles: true, composed: true }))
  }

  #reset(): void {
    this.#inFlight?.abort()
    this.#request = null
    this.#followUps = []
    this.#pendingQuestion = null
    this.#parsed = null
    this.#$('.transcript').replaceChildren()
    this.#$('.outcome').hidden = true
    this.#$('.build').hidden = true
    this.#$('.build').textContent = 'Fill my trolley'
    this.#$('.building').hidden = true
    this.#$('.basket').hidden = true
    this.#$<HTMLDetailsElement>('.debug').hidden = true
    this.#input.value = ''
    this.#showError(null)
    this.#syncForm()
    this.#input.focus()
  }

  /** Shows the input only while there is something to type: a new request or an answer to a question. */
  #syncForm(): void {
    const done = this.#request !== null && this.#pendingQuestion === null
    const started = this.#request !== null
    this.#form.querySelector<HTMLLabelElement>('label')!.hidden = done
    this.#input.hidden = done
    this.#submit.hidden = done
    this.#$('.intro').hidden = started
    this.#$('.restart').hidden = !started
    this.#inputLabel.textContent = this.#pendingQuestion ? 'Your answer' : 'What are we shopping for?'
    this.#input.placeholder = this.#pendingQuestion ? 'Type your answer here' : REQUEST_PLACEHOLDER
    this.#submit.textContent = this.#pendingQuestion ? 'Send' : "Let's go"
    if (!done && this.#dialog.open) this.#input.focus()
  }

  #setBusy(busy: boolean): void {
    this.#submit.disabled = busy
    this.#input.disabled = busy
    this.#form.setAttribute('aria-busy', String(busy))
    if (busy) this.#submit.textContent = 'Having a think…'
  }

  #addBubble(who: 'you' | 'assistant', text: string): void {
    const li = document.createElement('li')
    li.className = who
    li.textContent = text // textContent, never innerHTML: this is user and model text
    this.#$('.transcript').append(li)
  }

  #showError(message: string | null): void {
    const el = this.#$('.error')
    el.textContent = message ?? ''
    el.hidden = message === null
  }

  get #apiBase(): string {
    return (this.getAttribute('api-base') ?? '').replace(/\/+$/, '')
  }

  #renderLabel(): void {
    this.#trigger.textContent = this.getAttribute('label') || DEFAULT_LABEL
  }

  #$<T extends Element = HTMLElement>(selector: string): T {
    return this.#root.querySelector<T>(selector)!
  }
}

if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, DoMyShoppingButton)
}

declare global {
  interface HTMLElementTagNameMap {
    [TAG_NAME]: DoMyShoppingButton
  }
}
