import { useEffect, useState } from 'react'
import { useAuthStore, type ManualAuthMode } from '../../stores/authStore'
import type { AuthStatus } from '../../lib/contracts'
import Button from '../common/Button'
import Input from '../common/Input'
import Toast from '../common/Toast'

function AuthPanel() {
  const {
    status,
    baseUrl,
    manualMode,
    isLoading,
    error,
    setBaseUrl,
    setManualMode,
    loadStatus,
    startSsoLogin,
    saveManualAuth,
    logout,
    clearError,
  } = useAuthStore()

  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info')

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    if (error) {
      setToastMessage(error)
      setToastType('error')
      setShowToast(true)
    }
  }, [error])

  if (status.authenticated) {
    return (
      <div className="max-w-xl mx-auto animate-fade-in stagger-2">
        <div className="card-app">
          <div className="px-8 py-6 border-b border-border">
            <h2 className="font-display text-xl font-semibold text-text-primary tracking-tight">
              Connected
            </h2>
            <p className="text-sm text-text-secondary mt-2">
              You are signed in to Confluence
            </p>
          </div>

          <div className="p-8 space-y-4">
            <div className="rounded-xl bg-bg-secondary border border-border px-4 py-3">
              <p className="text-sm text-text-muted">Confluence URL</p>
              <p className="text-sm text-text-primary font-medium mt-1">{status.baseUrl}</p>
            </div>

            <div className="rounded-xl bg-bg-secondary border border-border px-4 py-3">
              <p className="text-sm text-text-muted">Authentication method</p>
              <p className="text-sm text-text-primary font-medium mt-1">
                {formatAuthMethod(status.method)}
              </p>
            </div>

            {status.displayName && (
              <div className="rounded-xl bg-bg-secondary border border-border px-4 py-3">
                <p className="text-sm text-text-muted">Account</p>
                <p className="text-sm text-text-primary font-medium mt-1">{status.displayName}</p>
              </div>
            )}
          </div>

          <div className="px-8 py-6 bg-bg-secondary border-t border-border flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success" />
              <span className="text-sm text-success font-medium">Authenticated</span>
            </div>
            <Button variant="secondary" onClick={() => void logout()} loading={isLoading}>
              Logout
            </Button>
          </div>
        </div>

        {showToast && (
          <Toast
            message={toastMessage}
            type={toastType}
            onClose={() => {
              setShowToast(false)
              clearError()
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto animate-fade-in stagger-2">
      <div className="card-app">
        <div className="px-8 py-6 border-b border-border">
          <h2 className="font-display text-xl font-semibold text-text-primary tracking-tight">
            Authentication
          </h2>
          <p className="text-sm text-text-secondary mt-2">
            Sign in with SSO or use a manual fallback
          </p>
        </div>

        <div className="p-8 space-y-6">
          <Input
            label="Confluence URL"
            placeholder="https://your-company.atlassian.net"
            type="url"
            value={baseUrl}
            onChange={setBaseUrl}
          />

          <div className="space-y-3">
            <Button
              size="lg"
              onClick={() => void startSsoLogin()}
              loading={isLoading && manualMode === null}
              disabled={!baseUrl}
            >
              Sign in with SSO
            </Button>
            <p className="text-xs text-text-muted">
              Opens Confluence in a secure browser window (coming in Task 6).
            </p>
          </div>

          <div className="border-t border-border pt-6 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-text-primary">Manual fallback</h3>
              <p className="text-xs text-text-muted mt-1">
                Use API token or session cookie when SSO is unavailable.
              </p>
            </div>

            <ManualModeTabs activeMode={manualMode} onChange={setManualMode} />

            {manualMode === 'api_token' && (
              <ApiTokenForm
                baseUrl={baseUrl}
                isLoading={isLoading}
                onSubmit={saveManualAuth}
              />
            )}

            {manualMode === 'cookie' && (
              <CookieForm
                baseUrl={baseUrl}
                isLoading={isLoading}
                onSubmit={saveManualAuth}
              />
            )}
          </div>
        </div>

        <div className="px-8 py-6 bg-bg-secondary border-t border-border">
          <span className="text-sm text-text-muted">Not connected</span>
        </div>
      </div>

      {showToast && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={() => {
            setShowToast(false)
            clearError()
          }}
        />
      )}
    </div>
  )
}

function ManualModeTabs({
  activeMode,
  onChange,
}: {
  activeMode: ManualAuthMode | null
  onChange: (mode: ManualAuthMode | null) => void
}) {
  const methods: { key: ManualAuthMode; label: string }[] = [
    { key: 'api_token', label: 'API Token' },
    { key: 'cookie', label: 'Session Cookie' },
  ]

  return (
    <div className="flex gap-2">
      {methods.map((method) => (
        <button
          key={method.key}
          type="button"
          onClick={() => onChange(activeMode === method.key ? null : method.key)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeMode === method.key
              ? 'bg-accent text-white'
              : 'bg-bg-secondary text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
          }`}
        >
          {method.label}
        </button>
      ))}
    </div>
  )
}

function ApiTokenForm({
  baseUrl,
  isLoading,
  onSubmit,
}: {
  baseUrl: string
  isLoading: boolean
  onSubmit: (config: {
    baseUrl: string
    method: 'api_token'
    username?: string
    apiToken?: string
  }) => Promise<void>
}) {
  const [username, setUsername] = useState('')
  const [apiToken, setApiToken] = useState('')

  const canSubmit = Boolean(baseUrl && username && apiToken)

  return (
    <div className="space-y-5 animate-fade-in stagger-3">
      <Input
        label="Email / Username"
        placeholder="your-email@company.com"
        value={username}
        onChange={setUsername}
      />
      <Input
        label="API Token"
        placeholder="Get from Atlassian Account Settings"
        type="password"
        value={apiToken}
        onChange={setApiToken}
      />
      <p className="text-xs text-text-muted">
        Generate API token at Atlassian Account → Security → API tokens
      </p>
      <Button
        variant="secondary"
        onClick={() =>
          void onSubmit({
            baseUrl,
            method: 'api_token',
            username,
            apiToken,
          })
        }
        loading={isLoading}
        disabled={!canSubmit}
      >
        Save API Token
      </Button>
    </div>
  )
}

function CookieForm({
  baseUrl,
  isLoading,
  onSubmit,
}: {
  baseUrl: string
  isLoading: boolean
  onSubmit: (config: {
    baseUrl: string
    method: 'cookie'
    cookie?: string
  }) => Promise<void>
}) {
  const [cookie, setCookie] = useState('')

  const canSubmit = Boolean(baseUrl && cookie)

  return (
    <div className="space-y-5 animate-fade-in stagger-3">
      <Input
        label="Session Cookie"
        placeholder="cookie1=value1; cookie2=value2"
        value={cookie}
        onChange={setCookie}
      />
      <p className="text-xs text-text-muted">
        Copy cookies from browser DevTools → Application → Cookies after SSO login
      </p>
      <Button
        variant="secondary"
        onClick={() =>
          void onSubmit({
            baseUrl,
            method: 'cookie',
            cookie,
          })
        }
        loading={isLoading}
        disabled={!canSubmit}
      >
        Save Cookie
      </Button>
    </div>
  )
}

function formatAuthMethod(method: AuthStatus['method']): string {
  switch (method) {
    case 'sso':
      return 'SSO'
    case 'api_token':
      return 'API Token'
    case 'cookie':
      return 'Session Cookie'
    default:
      return 'Unknown'
  }
}

export default AuthPanel
