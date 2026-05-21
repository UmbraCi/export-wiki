import { useTranslation } from 'react-i18next'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  label?: string
  options: SelectOption[]
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

function Select({
  label,
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
}: SelectProps) {
  const { t } = useTranslation('common')
  const resolvedPlaceholder = placeholder ?? t('select.placeholder')

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          className={`w-full px-4 py-3 rounded-xl text-sm text-text-primary bg-bg-card border appearance-none transition-all duration-200 input-app ${
            disabled
              ? 'bg-bg-secondary border-border cursor-not-allowed text-text-muted'
              : 'border-border hover:border-text-muted'
          }`}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2386868b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            backgroundSize: '20px',
          }}
        >
          <option value="" disabled>
            {resolvedPlaceholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export default Select
