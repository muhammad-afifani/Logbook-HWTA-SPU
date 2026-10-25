import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg'

const base =
  'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold ' +
  'transition-[transform,opacity] duration-150 ease-out active:scale-[0.97] ' +
  'disabled:pointer-events-none disabled:opacity-45'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent shadow-[0_8px_24px_-12px_var(--c-glow)] hover:opacity-95',
  secondary: 'border border-line-strong bg-surface-strong text-fg hover:opacity-90',
  ghost: 'text-fg-muted hover:text-fg',
  danger: 'bg-danger text-on-accent hover:opacity-95',
}

const sizes: Record<Size, string> = {
  // Target sentuh minimal 48 px.
  md: 'min-h-12 px-4 text-[15px]',
  lg: 'min-h-14 px-6 text-base',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  block?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  block,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
