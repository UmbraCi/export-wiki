import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { open } from '@tauri-apps/plugin-dialog'
import { FolderOpen } from 'lucide-react'
import { useConfigStore, defaultConfig } from '@/stores/configStore'
import { useExportStore } from '@/stores/exportStore'
import { useSelectionStore } from '@/stores/selectionStore'
import { useAuthStore } from '@/stores/authStore'
import { useNavStore } from '@/stores/navStore'
import { settingsFormSchema } from '@/lib/formSchemas'
import { formatAuthMethod } from '@/i18n/backend'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Field,
  FieldLabel,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from '@/components/ui/input-group'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'

function SettingsPanel() {
  const { t } = useTranslation(['settings', 'common', 'auth', 'export'])
  const {
    status,
    logout,
    reconnectWithSso,
    isLoading: authLoading,
  } = useAuthStore()
  const { config, loadConfig, saveConfig, isLoading, error } = useConfigStore()
  const setActiveView = useNavStore((s) => s.setActiveView)
  const setOptions = useExportStore((s) => s.setOptions)
  const selectedPageIds = useSelectionStore((s) => s.selectedPageIds)
  const form = useForm<z.infer<typeof settingsFormSchema>>({
    resolver: zodResolver(settingsFormSchema),
    values: config ?? defaultConfig,
  })
  const syncEnabled = form.watch('sync.enabled')

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])
  useEffect(() => {
    if (config)
      setOptions({
        includeAttachments: config.includeAttachmentsDefault,
        outputDir: config.defaultOutputDir,
      })
  }, [config, setOptions])

  const submit = form.handleSubmit(async (values) => {
    await saveConfig({
      ...config,
      ...values,
      sync: { ...values.sync, pageIds: selectedPageIds },
    })
  })
  const switches = [
    {
      name: 'includeAttachmentsDefault' as const,
      id: 'include-attachments',
      label: t('settings:toggles.includeAttachments.label'),
      description: t('settings:toggles.includeAttachments.description'),
    },
    {
      name: 'skipUnchangedDefault' as const,
      id: 'skip-unchanged',
      label: t('settings:toggles.skipUnchanged.label'),
      description: t('settings:toggles.skipUnchanged.description'),
    },
    {
      name: 'sync.enabled' as const,
      id: 'sync-enabled',
      label: t('settings:sync.enable.label'),
      description: t('settings:sync.enable.description'),
    },
  ]

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('settings:title')}</h2>
          </CardTitle>
          <CardDescription>{t('settings:subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <fieldset
            disabled={isLoading || form.formState.isSubmitting}
            className="space-y-6"
          >
            <Controller
              control={form.control}
              name="locale"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="locale">
                    {t('common:language.label')}
                  </FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="locale"
                      onBlur={field.onBlur}
                      ref={field.ref}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">
                        {t('common:language.en')}
                      </SelectItem>
                      <SelectItem value="zh-CN">
                        {t('common:language.zhCN')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {t('common:language.description')}
                  </FieldDescription>
                </Field>
              )}
            />
            <section className="space-y-4 border-y py-6">
              <div>
                <h3 className="font-semibold">{t('settings:account.title')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('settings:account.subtitle')}
                </p>
              </div>
              <dl className="space-y-2 rounded-lg border bg-muted/50 p-4 text-sm">
                <dt className="text-muted-foreground">
                  {t('auth:fields.confluenceUrl')}
                </dt>
                <dd className="break-all">{status.baseUrl ?? '—'}</dd>
                <dt className="text-muted-foreground">
                  {t('auth:fields.authenticationMethod')}
                </dt>
                <dd>{formatAuthMethod(status.method, t)}</dd>
              </dl>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveView('authentication')}
                >
                  {t('settings:account.openAuth')}
                </Button>
                <Button
                  type="button"
                  onClick={() => void reconnectWithSso()}
                  disabled={authLoading}
                >
                  {authLoading && <Spinner aria-hidden="true" />}
                  {t('auth:sso.signInAgain')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void logout()}
                  disabled={authLoading}
                >
                  {t('common:buttons.logout')}
                </Button>
              </div>
            </section>
            <Field>
              <FieldLabel htmlFor="default-output">
                {t('export:fields.outputDir')}
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="default-output"
                  placeholder={t('export:fields.outputDirPlaceholder')}
                  {...form.register('defaultOutputDir')}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label={t('export:fields.pickDir')}
                    onClick={async () => {
                      const selected = await open({ directory: true })
                      if (selected)
                        form.setValue('defaultOutputDir', selected, {
                          shouldDirty: true,
                        })
                    }}
                  >
                    <FolderOpen />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </Field>
            <Controller
              control={form.control}
              name="defaultFormat"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="default-format">
                    {t('export:format.label')}
                  </FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="default-format"
                      ref={field.ref}
                      onBlur={field.onBlur}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="markdown">
                        {t('export:format.markdown')}
                      </SelectItem>
                      <SelectItem value="html">
                        {t('export:format.html')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
            <FieldGroup>
              {switches.map(({ name, id, label, description }) => (
                <Controller
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <Field orientation="horizontal">
                      <Switch
                        id={id}
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                        aria-describedby={`${id}-description`}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={id}>{label}</FieldLabel>
                        <FieldDescription id={`${id}-description`}>
                          {description}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  )}
                />
              ))}
            </FieldGroup>
            <section className="space-y-4 border-t pt-6">
              <div>
                <h3 className="font-semibold">{t('settings:sync.title')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('settings:sync.subtitle')}
                </p>
              </div>
              <fieldset
                disabled={!syncEnabled}
                className="space-y-4 disabled:opacity-50"
              >
                <Field
                  data-invalid={!!form.formState.errors.sync?.intervalMinutes}
                >
                  <FieldLabel htmlFor="sync-interval">
                    {t('settings:sync.intervalLabel')}
                  </FieldLabel>
                  <Input
                    id="sync-interval"
                    type="number"
                    min={1}
                    {...form.register('sync.intervalMinutes', {
                      valueAsNumber: true,
                    })}
                    aria-invalid={!!form.formState.errors.sync?.intervalMinutes}
                    aria-describedby="sync-interval-error"
                  />
                  {form.formState.errors.sync?.intervalMinutes && (
                    <FieldError id="sync-interval-error">
                      {t('common:validation.positiveInteger')}
                    </FieldError>
                  )}
                </Field>
                <p className="text-sm text-muted-foreground">
                  {t('settings:sync.selectedPages')}{' '}
                  {selectedPageIds.length
                    ? t('settings:sync.selectedCount', {
                        count: selectedPageIds.length,
                      })
                    : t('settings:sync.selectedNone')}
                </p>
                <Field>
                  <FieldLabel htmlFor="sync-output">
                    {t('settings:sync.outputDir')}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="sync-output"
                      placeholder={
                        config?.defaultOutputDir ||
                        t('export:fields.outputDirPlaceholder')
                      }
                      {...form.register('sync.outputDir')}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        aria-label={t('export:fields.pickDir')}
                        onClick={async () => {
                          const selected = await open({ directory: true })
                          if (selected)
                            form.setValue('sync.outputDir', selected, {
                              shouldDirty: true,
                            })
                        }}
                      >
                        <FolderOpen />
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
              </fieldset>
              <Alert>
                <AlertDescription>
                  {t('settings:sync.warning')}
                </AlertDescription>
              </Alert>
            </section>
          </fieldset>
        </CardContent>
        <CardFooter className="justify-end border-t">
          <Button
            type="submit"
            disabled={isLoading || form.formState.isSubmitting}
            aria-busy={isLoading || form.formState.isSubmitting}
          >
            {(isLoading || form.formState.isSubmitting) && (
              <Spinner aria-hidden="true" />
            )}
            {t('common:buttons.saveSettings')}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

export default SettingsPanel
