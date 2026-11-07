import { Check } from 'lucide-react'
import { cn } from '../../lib/cn'

interface RoundCheckboxProps {
  checked: boolean
  onChange: () => void
  label: string
  size?: 'sm' | 'md'
}

export function RoundCheckbox({ checked, onChange, label, size = 'md' }: RoundCheckboxProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={cn('round-check', `round-check--${size}`, checked && 'is-checked')}
      onClick={onChange}
    >
      <Check size={size === 'sm' ? 11 : 13} strokeWidth={2.8} />
    </button>
  )
}
