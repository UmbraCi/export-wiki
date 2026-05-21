import { useConfigStore } from '../../stores/configStore'
import { useExportStore } from '../../stores/exportStore'
import Button from '../common/Button'
import Input from '../common/Input'
import Select from '../common/Select'
import { useEffect } from 'react'

function SettingsPanel() {
  const { config, loadConfig, saveConfig, isLoading } = useConfigStore()
  const { setOptions } = useExportStore()

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
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-bg-secondary border-t border-border flex justify-end">
          <Button onClick={() => saveConfig(config)} loading={isLoading}>Save Settings</Button>
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