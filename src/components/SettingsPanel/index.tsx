import { useConfigStore } from '../../stores/configStore'
import { useExportStore } from '../../stores/exportStore'
import { useSelectionStore } from '../../stores/selectionStore'
import { useAuthStore } from '../../stores/authStore'
import { useNavStore } from '../../stores/navStore'
import Button from '../common/Button'
import Input from '../common/Input'
import Select from '../common/Select'
import { useEffect } from 'react'

function formatAuthMethod(method: string | null | undefined): string {
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

function SettingsPanel() {
  const { status, logout, reconnectWithSso, isLoading: authLoading } = useAuthStore()
  const setActiveView = useNavStore((s) => s.setActiveView)
  const { config, loadConfig, saveConfig, updateSyncSettings, isLoading } = useConfigStore()
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
        {/* Header */}
        <div className="px-8 py-6 border-b border-border">
          <h2 className="font-display text-xl font-semibold text-text-primary">Settings</h2>
          <p className="text-sm text-text-secondary mt-2">Configure export options</p>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          <div className="space-y-4 pb-6 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Account</h3>
              <p className="text-xs text-text-muted mt-1">
                Manage Confluence sign-in, session cookies, and SSO.
              </p>
            </div>

            <div className="rounded-xl bg-bg-secondary border border-border px-4 py-3 space-y-2">
              <p className="text-sm text-text-muted">Confluence URL</p>
              <p className="text-sm text-text-primary font-medium break-all">
                {status.baseUrl ?? '—'}
              </p>
              <p className="text-sm text-text-muted pt-1">Authentication</p>
              <p className="text-sm text-text-primary font-medium">
                {formatAuthMethod(status.method)}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => setActiveView('authentication')}
              >
                Open authentication
              </Button>
              <Button onClick={() => void reconnectWithSso()} loading={authLoading}>
                Sign in again (SSO)
              </Button>
              <Button variant="secondary" onClick={() => void logout()} loading={authLoading}>
                Logout
              </Button>
            </div>
          </div>

          <Input
            label="Output Directory"
            placeholder="~/Documents/confluence-export"
            value={config.defaultOutputDir}
            onChange={(val) => saveConfig({ ...config, defaultOutputDir: val })}
          />

          <Select
            label="Export Format"
            options={[
              { value: 'markdown', label: 'Markdown (.md)' },
              { value: 'html', label: 'HTML (.html)' },
            ]}
            value={config.defaultFormat}
            onChange={(val) => saveConfig({ ...config, defaultFormat: val as 'markdown' | 'html' })}
          />

          <div className="space-y-4 pt-4 border-t border-border">
            <Toggle
              label="Include Attachments"
              description="Download and include page attachments"
              checked={config.includeAttachmentsDefault}
              onChange={(checked) => saveConfig({ ...config, includeAttachmentsDefault: checked })}
            />
            <Toggle
              label="Skip Unchanged"
              description="Only export pages modified since last run"
              checked={config.skipUnchangedDefault}
              onChange={(checked) => saveConfig({ ...config, skipUnchangedDefault: checked })}
            />
          </div>

          <div className="space-y-4 pt-6 border-t border-border">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Background Sync</h3>
              <p className="text-xs text-text-muted mt-1">
                Periodically re-export selected pages while the app is open.
              </p>
            </div>

            <Toggle
              label="Enable Background Sync"
              description="Off by default — turn on to schedule automatic exports"
              checked={sync.enabled}
              onChange={(checked) => updateSyncSettings({ enabled: checked })}
            />

            <div className={sync.enabled ? 'space-y-4' : 'space-y-4 opacity-50 pointer-events-none'}>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-text-secondary">
                  Sync Interval (minutes)
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
                <span className="font-medium text-text-primary">Selected pages:</span>{' '}
                {selectedCount === 0
                  ? 'None — select pages in the browser before enabling sync'
                  : `${selectedCount} page${selectedCount === 1 ? '' : 's'}`}
              </div>

              <Input
                label="Sync Output Directory"
                placeholder={config.defaultOutputDir || '~/Documents/confluence-export'}
                value={sync.outputDir}
                onChange={(val) => updateSyncSettings({ outputDir: val })}
              />
            </div>

            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
              Background sync uses the saved credential and runs only while the desktop app is open.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-bg-secondary border-t border-border flex justify-end">
          <Button onClick={handleSave} loading={isLoading}>Save Settings</Button>
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
