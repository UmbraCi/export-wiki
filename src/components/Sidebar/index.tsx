import { BookDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import {
  authRequiredViews,
  useNavStore,
  type AppView,
} from '../../stores/navStore'
import { useAuthStore } from '../../stores/authStore'

function Sidebar() {
  const { t } = useTranslation('common')
  const { activeView, setActiveView } = useNavStore()
  const authenticated = useAuthStore((state) => state.status.authenticated)

  const navItems: { view: AppView; label: string }[] = [
    { view: 'authentication', label: t('nav.authentication') },
    { view: 'spaces', label: t('nav.spaces') },
    { view: 'settings', label: t('nav.settings') },
  ]

  return (
    <aside className="w-64 bg-card flex flex-col h-full border-r border-border">
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md">
            <BookDown className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-sans text-lg font-semibold text-foreground tracking-tight">
              {t('app.name')}
            </h1>
            <p className="text-xs text-muted-foreground">{t('app.tagline')}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {navItems.map(({ view, label }) => (
            <NavItem
              key={view}
              label={label}
              active={
                activeView === view ||
                (view === 'spaces' && activeView === 'export')
              }
              disabled={!authenticated && authRequiredViews.includes(view)}
              disabledTitle={t('nav.signInFirst')}
              onClick={() => setActiveView(view)}
            />
          ))}
        </div>
      </nav>

      <div className="px-6 py-4 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
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
    <Button
      variant={active ? 'secondary' : 'ghost'}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledTitle : undefined}
      aria-current={active ? 'page' : undefined}
      className={`w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
        disabled
          ? 'text-muted-foreground cursor-not-allowed opacity-50'
          : active
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {label}
    </Button>
  )
}

export default Sidebar
