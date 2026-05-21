interface ButtonProps {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  onClick?: () => void
}

function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
}: ButtonProps) {
  const baseClasses = 'font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 btn-app-hover'

  const variantClasses = {
    primary: 'bg-accent text-white hover:bg-accent-hover disabled:bg-bg-secondary disabled:text-text-muted',
    secondary: 'bg-bg-secondary text-text-primary hover:bg-bg-elevated disabled:bg-bg-secondary disabled:text-text-muted',
    ghost: 'bg-transparent text-text-secondary hover:bg-bg-elevated hover:text-text-primary disabled:text-text-muted',
  }

  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  }

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]}`}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  )
}

export default Button