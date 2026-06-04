import type { ReactNode } from 'react'

interface InputProps {
  label?: string
  placeholder?: string
  type?: 'text' | 'password' | 'email' | 'url'
  value?: string
  onChange?: (value: string) => void
  error?: string
  disabled?: boolean
  suffix?: ReactNode
}

function Input({
  label,
  placeholder,
  type = 'text',
  value,
  onChange,
  error,
  disabled = false,
  suffix,
}: InputProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          className={`w-full px-4 py-3 rounded-xl text-sm text-text-primary bg-bg-card border transition-all duration-200 input-app ${
            suffix ? 'pr-12' : ''
          } ${
            error
              ? 'border-error'
              : 'border-border hover:border-text-muted'
          } ${disabled ? 'bg-bg-secondary cursor-not-allowed text-text-muted' : ''}`}
        />
        {suffix && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {suffix}
          </div>
        )}
      </div>
      {error && (
        <p className="text-sm text-error">{error}</p>
      )}
    </div>
  )
}

export default Input
