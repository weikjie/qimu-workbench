import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger'
type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  trailingIcon?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  trailingIcon,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button type={type} className={cn('btn', `btn--${variant}`, `btn--${size}`, className)} {...props}>
      {icon ? <span className="btn__icon">{icon}</span> : null}
      {children ? <span className="btn__label">{children}</span> : null}
      {trailingIcon ? <span className="btn__icon btn__icon--trailing">{trailingIcon}</span> : null}
    </button>
  )
}
