import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { open } from '@tauri-apps/plugin-dialog'
import { useConfigStore } from '../../stores/configStore'
import { useExportStore } from '../../stores/exportStore'
import { useSelectionStore } from '../../stores/selectionStore'
import { useAuthStore } from '../../stores/authStore'
import { useNavStore } from '../../stores/navStore'
import { formatAuthMethod } from '../../i18n/backend'
import type { AppLocale } from '../../i18n'
import Button from '../common/Button'
import Input from '../common/Input'
import Select from '../common/Select'

function SettingsPanel() {
  const { t } = useTranslation(['settings', 'common', 'auth', 'export'])
  const { status, logout, reconnectWithSso, isLoading: authLoading } = useAuthStore()
  const setActiveView = useNavStore((s) => s.setActiveView)
  const { config, loadConfig, saveConfig, updateSyncSettings, setLocale, isLoading } = useConfigStore()
  const { setOptions } = useExportStore()
  const selectedPageIds = useSelectionStore((s) => s.selectedPageIds)

  useEffect(() => { loadConfig() }, [loadConfig])
  useEffect(() => {
    if (config) {
      setOptions({
        includeAttachments: config.includeAttachmentsDefault,
        outputDir: config.defaultOutputDir,
      })
    }
  }, [config, setOptions])

  if (!config) return null

  const sync = config.sync
  const selectedCount = selectedPageIds.length

  const handleSave = () => {
    saveConfig({
      ...config,
      sync: {
        ...sync,
        pageIds: selectedPageIds,
      },
    })
  }

  return (
    <div className="max-w-xl mx-auto animate-fade-in stagger-2">
      <div className="card-app">
        <div className="px-8 py-6 border-b border-border">
          <h2 className="font-display text-xl font-semibold text-text-primary">{t('settings:title')}</h2>
          <p className="text-sm text-text-secondary mt-2">{t('settings:subtitle')}</p>
        </div>

        <div className="p-8 space-y-6">
          <Select
            label={t('common:language.label')}
            options={[
              { value: 'en', label: t('common:language.en') },
              { value: 'zh-CN', label: t('common:language.zhCN') },
            ]}
            value={config.locale}
            onChange={(val) => void setLocale(val as AppLocale)}
          />
          <p className="text-xs text-text-muted -mt-4">{t('common:language.description')}</p>

          <div className="space-y-4 pb-6 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{t('settings:account.title')}</h3>
              <p className="text-xs text-text-muted mt-1">
                {t('settings:account.subtitle')}
              </p>
            </div>

            <div className="rounded-xl bg-bg-secondary border border-border px-4 py-3 space-y-2">
              <p className="text-sm text-text-muted">{t('auth:fields.confluenceUrl')}</p>
              <p className="text-sm text-text-primary font-medium break-all">
                {status.baseUrl ?? '—'}
              </p>
              <p className="text-sm text-text-muted pt-1">{t('auth:fields.authenticationMethod')}</p>
              <p className="text-sm text-text-primary font-medium">
                {formatAuthMethod(status.method, t)}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => setActiveView('authentication')}
              >
                {t('settings:account.openAuth')}
              </Button>
              <Button onClick={() => void reconnectWithSso()} loading={authLoading}>
                {t('auth:sso.signInAgain')}
              </Button>
              <Button variant="secondary" onClick={() => void logout()} loading={authLoading}>
                {t('common:buttons.logout')}
              </Button>
            </div>
          </div>

          <Input
            label={t('export:fields.outputDir')}
            placeholder={t('export:fields.outputDirPlaceholder')}
            value={config.defaultOutputDir}
            onChange={(val) => saveConfig({ ...config, defaultOutputDir: val })}
            suffix={
              <button
                type="button"
                onClick={async () => {
                  const selected = await open({ directory: true })
                  if (selected) saveConfig({ ...config, defaultOutputDir: selected })
                }}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
                title={t('export:fields.pickDir')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </button>
            }
          />

          <Select
            label={t('export:format.label')}
            options={[
              { value: 'markdown', label: t('export:format.markdown') },
              { value: 'html', label: t('export:format.html') },
            ]}
            value={config.defaultFormat}
            onChange={(val) => saveConfig({ ...config, defaultFormat: val as 'markdown' | 'html' })}
          />

          <div className="space-y-4 pt-4 border-t border-border">
            <Toggle
              label={t('settings:toggles.includeAttachments.label')}
              description={t('settings:toggles.includeAttachments.description')}
              checked={config.includeAttachmentsDefault}
              onChange={(checked) => saveConfig({ ...config, includeAttachmentsDefault: checked })}
            />
            <Toggle
              label={t('settings:toggles.skipUnchanged.label')}
              description={t('settings:toggles.skipUnchanged.description')}
              checked={config.skipUnchangedDefault}
              onChange={(checked) => saveConfig({ ...config, skipUnchangedDefault: checked })}
            />
          </div>

          <div className="space-y-4 pt-6 border-t border-border">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{t('settings:sync.title')}</h3>
              <p className="text-xs text-text-muted mt-1">
                {t('settings:sync.subtitle')}
              </p>
            </div>

            <Toggle
              label={t('settings:sync.enable.label')}
              description={t('settings:sync.enable.description')}
              checked={sync.enabled}
              onChange={(checked) => updateSyncSettings({ enabled: checked })}
            />

            <div className={sync.enabled ? 'space-y-4' : 'space-y-4 opacity-50 pointer-events-none'}>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-text-secondary">
                  {t('settings:sync.intervalLabel')}
                </label>
                <input
                  type="number"
                  min={1}
                  value={sync.intervalMinutes}
                  onChange={(e) => {
                    const minutes = Math.max(1, parseInt(e.target.value, 10) || 1)
                    updateSyncSettings({ intervalMinutes: minutes })
                  }}
                  className="w-full px-4 py-3 rounded-xl text-sm text-text-primary bg-bg-card border border-border transition-all duration-200 input-app"
                />
              </div>

              <div className="text-sm text-text-secondary">
                <span className="font-medium text-text-primary">{t('settings:sync.selectedPages')}</span>{' '}
                {selectedCount === 0
                  ? t('settings:sync.selectedNone')
                  : t('settings:sync.selectedCount', { count: selectedCount })}
              </div>

              <Input
                label={t('settings:sync.outputDir')}
                placeholder={config.defaultOutputDir || t('export:fields.outputDirPlaceholder')}
                value={sync.outputDir}
                onChange={(val) => updateSyncSettings({ outputDir: val })}
                suffix={
                  <button
                    type="button"
                    onClick={async () => {
                      const selected = await open({ directory: true })
                      if (selected) updateSyncSettings({ outputDir: selected })
                    }}
                    className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
                    title={t('export:fields.pickDir')}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </button>
                }
              />
            </div>

            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
              {t('settings:sync.warning')}
            </p>
          </div>
        </div>

        <div className="px-8 py-6 bg-bg-secondary border-t border-border flex justify-end">
          <Button onClick={handleSave} loading={isLoading}>{t('common:buttons.saveSettings')}</Button>
        </div>
      </div>
    </div>
  )
}

function Toggle({ label, description, checked, onChange }: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start gap-4 cursor-pointer">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-12 h-7 rounded-full transition-all duration-200 flex items-center ${
          checked ? 'bg-accent' : 'bg-border'
        }`}
      >
        <span className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
      <div className="flex-1">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        <span className="block text-xs text-text-muted mt-1">{description}</span>
      </div>
    </label>
  )
}

export default SettingsPanel
