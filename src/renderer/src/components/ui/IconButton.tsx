import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  icon: ReactNode
  variant?: 'ghost' | 'soft' | 'danger'
  size?: 'sm' | 'md'
}

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...props
}: IconButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn('icon-btn', `icon-btn--${variant}`, `icon-btn--${size}`, className)}
      {...props}
    >
      {icon}
    </button>
  )
}
