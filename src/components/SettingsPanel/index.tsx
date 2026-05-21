import { useConfigStore } from '../../stores/configStore'
import { useExportStore } from '../../stores/exportStore'
import { useSelectionStore } from '../../stores/selectionStore'
import Button from '../common/Button'
import Input from '../common/Input'
import Select from '../common/Select'
import { useEffect } from 'react'

function SettingsPanel() {
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
