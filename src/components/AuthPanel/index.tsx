import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore, formatCurrentUrl, initSsoEventListeners, type ManualAuthMode } from '../../stores/authStore'
import { formatAuthMethod } from '../../i18n/backend'
import Button from '../common/Button'
import Input from '../common/Input'
import Toast from '../common/Toast'

function AuthPanel() {
  const { t } = useTranslation(['auth', 'common'])
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
              {t('auth:connected.title')}
            </h2>
            <p className="text-sm text-text-secondary mt-2">
              {t('auth:connected.subtitle')}
            </p>
          </div>

          <div className="p-8 space-y-4">
            <div className="rounded-xl bg-bg-secondary border border-border px-4 py-3">
              <p className="text-sm text-text-muted">{t('auth:fields.confluenceUrl')}</p>
              <p className="text-sm text-text-primary font-medium mt-1">{status.baseUrl}</p>
            </div>

            <div className="rounded-xl bg-bg-secondary border border-border px-4 py-3">
              <p className="text-sm text-text-muted">{t('auth:fields.authenticationMethod')}</p>
              <p className="text-sm text-text-primary font-medium mt-1">
                {formatAuthMethod(status.method, t)}
              </p>
            </div>

            {status.displayName && (
              <div className="rounded-xl bg-bg-secondary border border-border px-4 py-3">
                <p className="text-sm text-text-muted">{t('auth:fields.account')}</p>
                <p className="text-sm text-text-primary font-medium mt-1">{status.displayName}</p>
              </div>
            )}
          </div>

          <div className="px-8 py-6 bg-bg-secondary border-t border-border space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success" />
              <span className="text-sm text-success font-medium">{t('common:status.authenticated')}</span>
            </div>

            <p className="text-xs text-text-muted">
              {t('auth:connectedActions.sessionHint')}
            </p>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void reconnectWithSso()} loading={isLoading}>
                {t('auth:sso.signInAgain')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowCookieUpdate((open) => !open)}
                disabled={isLoading}
              >
                {showCookieUpdate
                  ? t('auth:connectedActions.hideCookieUpdate')
                  : t('auth:connectedActions.updateSessionCookie')}
              </Button>
              <Button variant="secondary" onClick={() => void logout()} loading={isLoading}>
                {t('common:buttons.logout')}
              </Button>
            </div>

            {showCookieUpdate && (
              <div className="rounded-xl border border-border bg-bg-primary p-4 space-y-3 animate-fade-in">
                <Input
                  label={t('auth:fields.sessionCookie')}
                  placeholder={t('auth:fields.sessionCookiePlaceholder')}
                  value={sessionCookie}
                  onChange={setSessionCookie}
                />
                <p className="text-xs text-text-muted">
                  {t('auth:connectedActions.cookieDevToolsHint')}
                </p>
                <Button
                  variant="secondary"
                  onClick={() => void updateSessionCookie(sessionCookie)}
                  loading={isLoading}
                  disabled={!sessionCookie}
                >
                  {t('auth:manual.saveCookie')}
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
            {t('auth:panel.title')}
          </h2>
          <p className="text-sm text-text-secondary mt-2">
            {t('auth:panel.subtitle')}
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
                label={t('auth:fields.confluenceUrl')}
                placeholder={t('auth:fields.confluenceUrlPlaceholder')}
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
                  {t('auth:sso.signIn')}
                </Button>
                <p className="text-xs text-text-muted">
                  {manualMode === 'cookie'
                    ? t('auth:sso.cookieModeHint')
                    : t('auth:sso.defaultHint')}
                </p>
              </div>
            </>
          )}

          {!ssoSession?.active && (
            <div className="border-t border-border pt-6 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-text-primary">{t('auth:manual.title')}</h3>
                <p className="text-xs text-text-muted mt-1">
                  {t('auth:manual.subtitle')}
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
            {ssoSession?.active ? t('common:status.ssoInProgress') : t('common:status.notConnected')}
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
  const { t } = useTranslation(['auth', 'common'])
  const statusMessage = wikiSessionDetected
    ? t('auth:sso.completingAuto')
    : t('auth:sso.detectingSession')

  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-5 space-y-4 animate-fade-in">
      <div>
        <h3 className="text-sm font-medium text-text-primary">{t('auth:sso.inProgressTitle')}</h3>
        <p className="text-xs text-text-muted mt-1">
          {t('auth:sso.inProgressDescription')}
        </p>
      </div>

      <div className="rounded-lg bg-bg-primary border border-border px-4 py-3 space-y-3">
        <div>
          <p className="text-xs text-text-muted">{t('auth:sso.currentUrl')}</p>
          <p className="text-sm text-text-primary font-medium mt-1 break-all">
            {formatCurrentUrl(currentUrl)}
          </p>
        </div>

        <div>
          <p className="text-xs text-text-muted">{t('auth:sso.targetPage')}</p>
          <p className="text-sm text-text-primary font-medium mt-1 break-all">{entryUrl}</p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${wikiSessionDetected ? 'bg-success' : 'bg-text-muted'}`}
          />
          <span className="text-sm text-text-secondary">
            {t('auth:sso.wikiSession')}: {wikiSessionDetected ? t('auth:sso.detected') : t('auth:sso.notDetected')}
          </span>
        </div>

        <p className="text-xs text-text-muted">{statusMessage}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onOpenTarget} loading={isLoading}>
          {t('auth:sso.openTargetPage')}
        </Button>
        <Button onClick={onComplete} loading={isLoading} disabled={!wikiSessionDetected}>
          {t('auth:sso.completeLogin')}
        </Button>
        <Button variant="secondary" onClick={onCancel} loading={isLoading}>
          {t('common:buttons.cancel')}
        </Button>
      </div>

      {!wikiSessionDetected && (
        <p className="text-xs text-text-muted">
          {t('auth:sso.idpHint')}
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
  const { t } = useTranslation('common')
  const methods: { key: ManualAuthMode; label: string }[] = [
    { key: 'api_token', label: t('authMethod.apiToken') },
    { key: 'cookie', label: t('authMethod.cookie') },
  ]

  return (
    <div className="flex gap-2">
      {methods.map((method) => (
        <button
          key={method.key}
          type="button"
          onClick={() => {
            const nextMode = activeMode === method.key ? null : method.key
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
  const { t } = useTranslation('auth')
  const [username, setUsername] = useState('')
  const [apiToken, setApiToken] = useState('')
  const canSubmit = Boolean(baseUrl && username && apiToken)

  return (
    <div className="space-y-5 animate-fade-in stagger-3">
      <Input
        label={t('fields.emailUsername')}
        placeholder={t('fields.emailPlaceholder')}
        value={username}
        onChange={setUsername}
      />
      <Input
        label={t('fields.apiToken')}
        placeholder={t('fields.apiTokenPlaceholder')}
        type="password"
        value={apiToken}
        onChange={setApiToken}
      />
      <p className="text-xs text-text-muted">
        {t('manual.apiTokenHint')}
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
        {t('manual.saveApiToken')}
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
  const { t } = useTranslation('auth')
  const [cookie, setCookie] = useState('')
  const canSubmit = Boolean(baseUrl && cookie)

  return (
    <div className="space-y-5 animate-fade-in stagger-3">
      <Input
        label={t('fields.sessionCookie')}
        placeholder={t('fields.sessionCookiePlaceholder')}
        value={cookie}
        onChange={setCookie}
      />
      <p className="text-xs text-text-muted">
        {t('manual.cookieHint')}
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          if (!canSubmit) return
          void onSubmit({
            baseUrl,
            method: 'cookie',
            cookie,
          })
        }}
        loading={isLoading}
        disabled={!canSubmit}
      >
        {t('manual.saveCookie')}
      </Button>
    </div>
  )
}

export default AuthPanel
