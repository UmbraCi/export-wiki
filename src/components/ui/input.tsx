import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-12 w-full rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-primary transition-all duration-200 outline-none placeholder:text-text-muted hover:border-text-muted disabled:cursor-not-allowed disabled:bg-bg-secondary disabled:text-text-muted focus:border-accent focus:ring-4 focus:ring-accent/20',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
