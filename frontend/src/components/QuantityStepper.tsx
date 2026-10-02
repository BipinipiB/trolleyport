interface Props {
  quantity: number
  onChange: (quantity: number) => void
  label: string
}

export function QuantityStepper({ quantity, onChange, label }: Props) {
  return (
    <div className="stepper" role="group" aria-label={`Quantity of ${label}`}>
      <button type="button" onClick={() => onChange(quantity - 1)} aria-label={`Decrease ${label}`}>
        −
      </button>
      <span aria-live="polite">{quantity}</span>
      <button type="button" onClick={() => onChange(quantity + 1)} aria-label={`Increase ${label}`}>
        +
      </button>
    </div>
  )
}
