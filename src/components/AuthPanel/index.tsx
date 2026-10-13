import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  useAuthStore,
  formatCurrentUrl,
  type ManualAuthMode,
} from '@/stores/authStore'
import type { ManualAuthConfig } from '@/lib/contracts'
import { manualAuthSchema, wikiUrlSchema } from '@/lib/formSchemas'
import { formatAuthMethod } from '@/i18n/backend'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '@/components/ui/field'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

function AuthPanel() {
  const { t } = useTranslation(['auth', 'common'])
  const auth = useAuthStore()
  const [showCookieUpdate, setShowCookieUpdate] = useState(false)
  const [urlError, setUrlError] = useState<string>()

  useEffect(() => {
    if (auth.error) toast.error(auth.error)
  }, [auth.error])

  useEffect(() => {
    if (!auth.ssoSession?.active) return
    void auth.refreshSsoStatus()
    const interval = window.setInterval(
      () => void auth.refreshSsoStatus(),
      1000,
    )
    return () => window.clearInterval(interval)
  }, [auth.ssoSession?.active, auth.refreshSsoStatus])

  const startSso = () => {
    const result = wikiUrlSchema.safeParse(auth.baseUrl)
    setUrlError(result.success ? undefined : t('common:validation.httpsUrl'))
    if (result.success) void auth.startSsoLogin()
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>
          <h2>
            {t(
              auth.status.authenticated
                ? 'auth:connected.title'
                : 'auth:panel.title',
            )}
          </h2>
        </CardTitle>
        <CardDescription>
          {t(
            auth.status.authenticated
              ? 'auth:connected.subtitle'
              : 'auth:panel.subtitle',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {auth.error && (
          <Alert variant="destructive">
            <AlertDescription>{auth.error}</AlertDescription>
          </Alert>
        )}
        {auth.status.authenticated ? (
          <>
            <dl className="space-y-3 rounded-lg border bg-muted/50 p-4 text-sm">
              <div>
                <dt className="text-muted-foreground">
                  {t('auth:fields.confluenceUrl')}
                </dt>
                <dd className="mt-1 break-all">{auth.status.baseUrl}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {t('auth:fields.authenticationMethod')}
                </dt>
                <dd className="mt-1">
                  {formatAuthMethod(auth.status.method, t)}
                </dd>
              </div>
              {auth.status.displayName && (
                <div>
                  <dt className="text-muted-foreground">
                    {t('auth:fields.account')}
                  </dt>
                  <dd className="mt-1">{auth.status.displayName}</dd>
                </div>
              )}
            </dl>
            <p className="text-sm text-muted-foreground">
              {t('auth:connectedActions.sessionHint')}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => void auth.reconnectWithSso()}
                disabled={auth.isLoading}
              >
                {auth.isLoading && <Spinner aria-hidden="true" />}
                {t('auth:sso.signInAgain')}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCookieUpdate((open) => !open)}
                disabled={auth.isLoading}
              >
                {t(
                  showCookieUpdate
                    ? 'auth:connectedActions.hideCookieUpdate'
                    : 'auth:connectedActions.updateSessionCookie',
                )}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void auth.logout()}
                disabled={auth.isLoading}
              >
                {t('common:buttons.logout')}
              </Button>
            </div>
            {showCookieUpdate && (
              <ManualAuthForm
                mode="cookie"
                baseUrl={auth.status.baseUrl ?? ''}
                isLoading={auth.isLoading}
                onSubmit={(config) =>
                  auth.updateSessionCookie(config.cookie ?? '')
                }
              />
            )}
          </>
        ) : (
          <>
            {auth.status.validationError === 'AUTH_CHECK_FAILED' && (
              <Button
                variant="outline"
                disabled={auth.isLoading}
                onClick={() => void auth.loadStatus()}
              >
                {t('auth:retrySavedSession')}
              </Button>
            )}
            {auth.status.validationError === 'BROWSER_SESSION_CLEAR_FAILED' && (
              <Button
                variant="outline"
                disabled={auth.isLoading}
                onClick={() => void auth.logout()}
              >
                {t('common:buttons.logout')}
              </Button>
            )}
            {auth.ssoSession?.active ? (
              <section className="space-y-4 rounded-lg border bg-muted/50 p-4">
                <h3 className="font-semibold">
                  {t('auth:sso.inProgressTitle')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('auth:sso.inProgressDescription')}
                </p>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">
                      {t('auth:sso.currentUrl')}
                    </dt>
                    <dd className="break-all">
                      {formatCurrentUrl(auth.ssoStatus.currentUrl)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t('auth:sso.targetPage')}
                    </dt>
                    <dd className="break-all">{auth.ssoSession.entryUrl}</dd>
                  </div>
                </dl>
                <Badge variant="secondary">
                  {t('auth:sso.wikiSession')}:{' '}
                  {t(
                    auth.ssoStatus.wikiSessionDetected
                      ? 'auth:sso.detected'
                      : 'auth:sso.notDetected',
                  )}
                </Badge>
                <p className="text-sm text-muted-foreground" role="status">
                  {t(
                    auth.ssoStatus.wikiSessionDetected
                      ? 'auth:sso.completingAuto'
                      : 'auth:sso.detectingSession',
                  )}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={() => void auth.navigateSsoWindow()}
                    disabled={auth.isLoading}
                  >
                    {t('auth:sso.openTargetPage')}
                  </Button>
                  <Button
                    onClick={() => void auth.completeSsoLogin()}
                    disabled={
                      auth.isLoading || !auth.ssoStatus.wikiSessionDetected
                    }
                  >
                    {t('auth:sso.completeLogin')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void auth.cancelSsoLogin()}
                    disabled={auth.isLoading}
                  >
                    {t('common:buttons.cancel')}
                  </Button>
                </div>
                {!auth.ssoStatus.wikiSessionDetected && (
                  <p className="text-sm text-muted-foreground">
                    {t('auth:sso.idpHint')}
                  </p>
                )}
              </section>
            ) : (
              <>
                <Field data-invalid={!!urlError}>
                  <FieldLabel htmlFor="wiki-url">
                    {t('auth:fields.confluenceUrl')}
                  </FieldLabel>
                  <Input
                    id="wiki-url"
                    type="url"
                    value={auth.baseUrl}
                    placeholder={t('auth:fields.confluenceUrlPlaceholder')}
                    onChange={(event) => {
                      auth.setBaseUrl(event.target.value)
                      setUrlError(undefined)
                    }}
                    aria-invalid={!!urlError}
                    aria-describedby={urlError ? 'wiki-url-error' : undefined}
                  />
                  {urlError && (
                    <FieldError id="wiki-url-error">{urlError}</FieldError>
                  )}
                </Field>
                <Tabs
                  value={auth.manualMode ?? 'sso'}
                  onValueChange={(value) =>
                    auth.setManualMode(
                      value === 'sso' ? null : (value as ManualAuthMode),
                    )
                  }
                >
                  <TabsList className="mb-4">
                    <TabsTrigger value="sso">SSO</TabsTrigger>
                    <TabsTrigger value="api_token">
                      {t('common:authMethod.apiToken')}
                    </TabsTrigger>
                    <TabsTrigger value="cookie">
                      {t('common:authMethod.cookie')}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="sso" className="space-y-3">
                    <Button
                      size="lg"
                      onClick={startSso}
                      disabled={auth.isLoading || !auth.baseUrl}
                    >
                      {auth.isLoading && <Spinner aria-hidden="true" />}
                      {t('auth:sso.signIn')}
                    </Button>
                    <FieldDescription>
                      {t('auth:sso.defaultHint')}
                    </FieldDescription>
                  </TabsContent>
                  <TabsContent value="api_token">
                    <ManualAuthForm
                      mode="api_token"
                      baseUrl={auth.baseUrl}
                      isLoading={auth.isLoading}
                      onSubmit={auth.saveManualAuth}
                    />
                  </TabsContent>
                  <TabsContent value="cookie">
                    <ManualAuthForm
                      mode="cookie"
                      baseUrl={auth.baseUrl}
                      isLoading={auth.isLoading}
                      onSubmit={auth.saveManualAuth}
                    />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </>
        )}
      </CardContent>
      <CardFooter className="border-t text-sm text-muted-foreground">
        {t(
          auth.status.authenticated
            ? 'common:status.authenticated'
            : auth.ssoSession?.active
              ? 'common:status.ssoInProgress'
              : 'common:status.notConnected',
        )}
      </CardFooter>
    </Card>
  )
}

function ManualAuthForm({
  mode,
  baseUrl,
  isLoading,
  onSubmit,
}: {
  mode: ManualAuthMode
  baseUrl: string
  isLoading: boolean
  onSubmit: (config: ManualAuthConfig) => Promise<void>
}) {
  const { t } = useTranslation(['auth', 'common'])
  const form = useForm<z.infer<typeof manualAuthSchema>>({
    resolver: zodResolver(manualAuthSchema),
    defaultValues:
      mode === 'api_token'
        ? { method: mode, baseUrl, username: '', apiToken: '' }
        : { method: mode, baseUrl, cookie: '' },
  })
  useEffect(() => {
    form.setValue('baseUrl', baseUrl)
  }, [baseUrl, form.setValue])
  const fields =
    mode === 'api_token'
      ? (['username', 'apiToken'] as const)
      : (['cookie'] as const)
  const labels = {
    username: 'emailUsername',
    apiToken: 'apiToken',
    cookie: 'sessionCookie',
  }
  const placeholders = {
    username: 'emailPlaceholder',
    apiToken: 'apiTokenPlaceholder',
    cookie: 'sessionCookiePlaceholder',
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
      noValidate
    >
      {fields.map((name) => {
        const error = form.getFieldState(name, form.formState).error
        const id = `manual-${mode}-${name}`
        return (
          <Field key={name} data-invalid={!!error}>
            <FieldLabel htmlFor={id}>
              {t(`auth:fields.${labels[name]}`)}
            </FieldLabel>
            <Input
              id={id}
              type={name === 'username' ? 'text' : 'password'}
              autoComplete="off"
              placeholder={t(`auth:fields.${placeholders[name]}`)}
              {...form.register(name)}
              disabled={isLoading}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            {error && (
              <FieldError id={`${id}-error`}>
                {t(`common:${error.message}`)}
              </FieldError>
            )}
          </Field>
        )
      })}
      {form.formState.errors.baseUrl && (
        <FieldError>{t('common:validation.httpsUrl')}</FieldError>
      )}
      <FieldDescription>
        {t(
          mode === 'api_token'
            ? 'auth:manual.apiTokenHint'
            : 'auth:manual.cookieHint',
        )}
      </FieldDescription>
      <Button
        type="submit"
        disabled={isLoading || form.formState.isSubmitting}
        aria-busy={isLoading || form.formState.isSubmitting}
      >
        {(isLoading || form.formState.isSubmitting) && (
          <Spinner aria-hidden="true" />
        )}
        {t(
          mode === 'api_token'
            ? 'auth:manual.saveApiToken'
            : 'auth:manual.saveCookie',
        )}
      </Button>
    </form>
  )
}

export default AuthPanel
