import { useTranslation } from 'react-i18next'
import { authRequiredViews, useNavStore, type AppView } from '../../stores/navStore'
import { useAuthStore } from '../../stores/authStore'

function Sidebar() {
  const { t } = useTranslation('common')
  const { activeView, setActiveView } = useNavStore()
  const authenticated = useAuthStore((state) => state.status.authenticated)

  const navItems: { view: AppView; label: string }[] = [
    { view: 'authentication', label: t('nav.authentication') },
    { view: 'spaces', label: t('nav.spaces') },
    { view: 'pages', label: t('nav.pages') },
    { view: 'settings', label: t('nav.settings') },
  ]

  return (
    <aside className="w-64 bg-bg-card flex flex-col h-full border-r border-border">
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-3 animate-fade-in stagger-1">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-md">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l4.59-4.58L18 11l-6 6z"/>
            </svg>
          </div>
          <div>
            <h1 className="font-display text-lg font-semibold text-text-primary tracking-tight">
              {t('app.name')}
            </h1>
            <p className="text-xs text-text-muted">
              {t('app.tagline')}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {navItems.map(({ view, label }) => (
            <NavItem
              key={view}
              label={label}
              active={activeView === view}
              disabled={!authenticated && authRequiredViews.includes(view)}
              disabledTitle={t('nav.signInFirst')}
              onClick={() => setActiveView(view)}
            />
          ))}
        </div>
      </nav>

      <div className="px-6 py-4 border-t border-border">
        <p className="text-xs text-text-muted text-center">
          {t('version', { version: '1.0.0' })}
        </p>
      </div>
    </aside>
  )
}

function NavItem({
  label,
  active = false,
  disabled = false,
  disabledTitle,
  onClick,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  disabledTitle?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledTitle : undefined}
      className={`w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
        disabled
          ? 'text-text-muted cursor-not-allowed opacity-50'
          : active
            ? 'bg-bg-secondary text-text-primary'
            : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  )
}

export default Sidebar
