import { useTranslation } from 'react-i18next'
import { useThemeStore, ThemeMode } from '../../stores/themeStore'

function Header() {
  const { t } = useTranslation('common')
  const { mode, setMode } = useThemeStore()

  return (
    <header className="bg-bg-card border-b border-border px-8 py-6">
      <div className="flex items-center justify-between animate-fade-in stagger-1">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary tracking-tight">
            {t('app.title')}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {t('app.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-bg-secondary">
            <ThemeButton mode="light" current={mode} setMode={setMode} title={t('theme.light')} icon="☀" />
            <ThemeButton mode="system" current={mode} setMode={setMode} title={t('theme.system')} icon="●" />
            <ThemeButton mode="dark" current={mode} setMode={setMode} title={t('theme.dark')} icon="☾" />
          </div>

          <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-bg-secondary">
            <span className="w-2 h-2 rounded-full bg-success" />
            <span className="text-sm text-text-secondary">{t('status.ready')}</span>
          </div>
        </div>
      </div>
    </header>
  )
}

function ThemeButton({ mode, current, setMode, title, icon }: {
  mode: ThemeMode
  current: ThemeMode
  setMode: (mode: ThemeMode) => void
  title: string
  icon: string
}) {
  const isActive = mode === current

  return (
    <button
      onClick={() => setMode(mode)}
      className={`w-8 h-8 rounded-md flex items-center justify-center text-sm transition-all duration-200 ${
        isActive
          ? 'bg-accent text-white'
          : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated'
      }`}
      title={title}
    >
      {icon}
    </button>
  )
}

export default Header
