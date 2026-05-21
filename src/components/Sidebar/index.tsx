import { authRequiredViews, useNavStore, type AppView } from '../../stores/navStore'
import { useAuthStore } from '../../stores/authStore'

const navItems: { view: AppView; label: string }[] = [
  { view: 'authentication', label: 'Authentication' },
  { view: 'spaces', label: 'Spaces' },
  { view: 'pages', label: 'Pages' },
  { view: 'settings', label: 'Settings' },
]

function Sidebar() {
  const { activeView, setActiveView } = useNavStore()
  const authenticated = useAuthStore((state) => state.status.authenticated)

  return (
    <aside className="w-64 bg-bg-card flex flex-col h-full border-r border-border">
      {/* Logo */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-3 animate-fade-in stagger-1">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-md">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l4.59-4.58L18 11l-6 6z"/>
            </svg>
          </div>
          <div>
            <h1 className="font-display text-lg font-semibold text-text-primary tracking-tight">
              Export Wiki
            </h1>
            <p className="text-xs text-text-muted">
              Confluence Publisher
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {navItems.map(({ view, label }) => (
            <NavItem
              key={view}
              label={label}
              active={activeView === view}
              disabled={!authenticated && authRequiredViews.includes(view)}
              onClick={() => setActiveView(view)}
            />
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border">
        <p className="text-xs text-text-muted text-center">
          Version 1.0.0
        </p>
      </div>
    </aside>
  )
}

function NavItem({
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Sign in first to access this section' : undefined}
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