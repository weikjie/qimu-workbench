import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

interface SegmentedProps<T extends string> {
  value: T
  options: ReadonlyArray<SegmentedOption<T>>
  onChange: (value: T) => void
  label: string
  compact?: boolean
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  compact = false
}: SegmentedProps<T>): React.JSX.Element {
  return (
    <div className={cn('segmented', compact && 'segmented--compact')} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="button"
          aria-pressed={value === option.value}
          className={cn('segmented__item', value === option.value && 'is-active')}
          onClick={() => onChange(option.value)}
        >
          {option.icon ? <span className="segmented__icon">{option.icon}</span> : null}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  )
}
