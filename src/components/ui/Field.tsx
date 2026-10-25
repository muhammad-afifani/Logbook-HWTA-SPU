import type { ReactNode } from 'react'

interface FieldProps {
  id: string
  label: string
  required?: boolean
  error?: string
  hint?: ReactNode
  className?: string
  children: ReactNode
}

export function Field({ id, label, required, error, hint, className = '', children }: FieldProps) {
  return (
    <div className={className} data-field={id}>
      <label htmlFor={id} className="text-sm font-medium text-fg-muted">
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="text-danger">
              {' '}
              *
            </span>
            <span className="sr-only"> (wajib)</span>
          </>
        )}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-fg-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
