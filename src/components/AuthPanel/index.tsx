import { useEffect, useState } from 'react'
import { useAuthStore, formatCurrentUrl, initSsoEventListeners, type ManualAuthMode } from '../../stores/authStore'
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
    ssoSession,
    ssoStatus,
    setBaseUrl,
    setManualMode,
    loadStatus,
    startSsoLogin,
    refreshSsoStatus,
    navigateSsoWindow,
    completeSsoLogin,
    cancelSsoLogin,
    saveManualAuth,
    logout,
    reconnectWithSso,
    updateSessionCookie,
    clearError,
  } = useAuthStore()

  const [showCookieUpdate, setShowCookieUpdate] = useState(false)
  const [sessionCookie, setSessionCookie] = useState('')

  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info')

  useEffect(() => {
    initSsoEventListeners()
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    if (error) {
      setToastMessage(error)
      setToastType('error')
      setShowToast(true)
    }
  }, [error])

  useEffect(() => {
    if (!ssoSession?.active) return

    void refreshSsoStatus()
    const interval = window.setInterval(() => {
      void refreshSsoStatus()
    }, 1000)

    return () => window.clearInterval(interval)
  }, [ssoSession?.active, refreshSsoStatus])

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

          <div className="px-8 py-6 bg-bg-secondary border-t border-border space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success" />
              <span className="text-sm text-success font-medium">Authenticated</span>
            </div>

            <p className="text-xs text-text-muted">
              Session expired or API errors? Sign in again with SSO, update your session cookie, or log out.
            </p>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void reconnectWithSso()} loading={isLoading}>
                Sign in again (SSO)
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowCookieUpdate((open) => !open)}
                disabled={isLoading}
              >
                {showCookieUpdate ? 'Hide cookie update' : 'Update session cookie'}
              </Button>
              <Button variant="secondary" onClick={() => void logout()} loading={isLoading}>
                Logout
              </Button>
            </div>

            {showCookieUpdate && (
              <div className="rounded-xl border border-border bg-bg-primary p-4 space-y-3 animate-fade-in">
                <Input
                  label="Session Cookie"
                  placeholder="cookie1=value1; cookie2=value2"
                  value={sessionCookie}
                  onChange={setSessionCookie}
                />
                <p className="text-xs text-text-muted">
                  Copy cookies from browser DevTools after signing in to Confluence in your browser.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => void updateSessionCookie(sessionCookie)}
                  loading={isLoading}
                  disabled={!sessionCookie}
                >
                  Save cookie
                </Button>
              </div>
            )}
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
          {ssoSession?.active ? (
            <SsoInProgressPanel
              entryUrl={ssoSession.entryUrl}
              currentUrl={ssoStatus.currentUrl}
              wikiSessionDetected={ssoStatus.wikiSessionDetected}
              isLoading={isLoading}
              onOpenTarget={() => void navigateSsoWindow()}
              onComplete={() => void completeSsoLogin()}
              onCancel={() => void cancelSsoLogin()}
            />
          ) : (
            <>
              <Input
                label="Confluence URL"
                placeholder="https://your-company.atlassian.net or full wiki page URL"
                type="url"
                value={baseUrl}
                onChange={setBaseUrl}
              />

              <div className="space-y-3">
                <Button
                  size="lg"
                  onClick={() => void startSsoLogin()}
                  loading={isLoading && manualMode === null}
                  disabled={!baseUrl || manualMode === 'cookie'}
                >
                  Sign in with SSO
                </Button>
                <p className="text-xs text-text-muted">
                  {manualMode === 'cookie'
                    ? 'Using session cookie below — SSO window will not open. Click Save Cookie after pasting cookies from DevTools.'
                    : 'Opens Confluence in a secure browser window. Complete IdP login there, then use the main app to open your target page and confirm.'}
                </p>
              </div>
            </>
          )}

          {!ssoSession?.active && (
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
          )}
        </div>

        <div className="px-8 py-6 bg-bg-secondary border-t border-border">
          <span className="text-sm text-text-muted">
            {ssoSession?.active ? 'SSO login in progress' : 'Not connected'}
          </span>
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

function SsoInProgressPanel({
  entryUrl,
  currentUrl,
  wikiSessionDetected,
  isLoading,
  onOpenTarget,
  onComplete,
  onCancel,
}: {
  entryUrl: string
  currentUrl: string | null
  wikiSessionDetected: boolean
  isLoading: boolean
  onOpenTarget: () => void
  onComplete: () => void
  onCancel: () => void
}) {
  const statusMessage = wikiSessionDetected
    ? 'Completing login automatically…'
    : 'Detecting wiki session…'

  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-5 space-y-4 animate-fade-in">
      <div>
        <h3 className="text-sm font-medium text-text-primary">SSO login in progress</h3>
        <p className="text-xs text-text-muted mt-1">
          Complete login in the SSO window. When the wiki page loads as signed in, this app will detect the session and connect automatically.
        </p>
      </div>

      <div className="rounded-lg bg-bg-primary border border-border px-4 py-3 space-y-3">
        <div>
          <p className="text-xs text-text-muted">Login window current URL</p>
          <p className="text-sm text-text-primary font-medium mt-1 break-all">
            {formatCurrentUrl(currentUrl)}
          </p>
        </div>

        <div>
          <p className="text-xs text-text-muted">Target page</p>
          <p className="text-sm text-text-primary font-medium mt-1 break-all">{entryUrl}</p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${wikiSessionDetected ? 'bg-success' : 'bg-text-muted'}`}
          />
          <span className="text-sm text-text-secondary">
            Wiki session: {wikiSessionDetected ? 'Detected' : 'Not detected'}
          </span>
        </div>

        <p className="text-xs text-text-muted">{statusMessage}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onOpenTarget} loading={isLoading}>
          Open target page
        </Button>
        <Button onClick={onComplete} loading={isLoading} disabled={!wikiSessionDetected}>
          Complete login
        </Button>
        <Button variant="secondary" onClick={onCancel} loading={isLoading}>
          Cancel
        </Button>
      </div>

      {!wikiSessionDetected && (
        <p className="text-xs text-text-muted">
          If IdP login finishes without redirecting back to wiki, click Open target page to load Confluence in the SSO window.
        </p>
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
          onClick={() => {
            const nextMode = activeMode === method.key ? null : method.key
            console.log('[auth-diag] manual mode tab clicked', {
              tab: method.key,
              nextMode,
              previousMode: activeMode,
            })
            onChange(nextMode)
          }}
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

  useEffect(() => {
    console.log('[auth-diag] CookieForm state', {
      baseUrl,
      hasBaseUrl: Boolean(baseUrl),
      cookieLength: cookie.length,
      canSubmit,
    })
  }, [baseUrl, cookie, canSubmit])

  return (
    <div className="space-y-5 animate-fade-in stagger-3">
      <Input
        label="Session Cookie"
        placeholder="cookie1=value1; cookie2=value2"
        value={cookie}
        onChange={setCookie}
      />
      <p className="text-xs text-text-muted">
        In DevTools → Application → Cookies for wiki.heytea.com, copy the full header
        (must include seraph.confluence, not only JSESSIONID). Then click Save Cookie — this does not open SSO.
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          console.log('[auth-diag] Save Cookie clicked', {
            baseUrl,
            canSubmit,
            cookieNames: cookie
              .split(';')
              .map((part) => part.trim().split('=')[0]?.trim())
              .filter(Boolean),
            cookieLength: cookie.length,
          })
          if (!canSubmit) {
            console.warn('[auth-diag] Save Cookie blocked: missing baseUrl or cookie', {
              hasBaseUrl: Boolean(baseUrl),
              hasCookie: Boolean(cookie),
            })
            return
          }
          void onSubmit({
            baseUrl,
            method: 'cookie',
            cookie,
          })
        }}
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
