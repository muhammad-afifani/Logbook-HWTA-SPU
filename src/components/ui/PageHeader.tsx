import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-5 pb-4 lg:px-8 lg:pt-8">
      <div className="min-w-0">
        {eyebrow && (
          <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-balance lg:text-3xl">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-prose text-[15px] text-fg-muted">{description}</p>
        )}
      </div>
      {actions}
    </div>
  )
}
