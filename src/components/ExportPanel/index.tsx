import { useExportStore } from '../../stores/exportStore'
import { useSelectionStore } from '../../stores/selectionStore'
import Button from '../common/Button'
import Input from '../common/Input'

function ExportPanel() {
  const { options, setOptions, startExport, isExporting, error } = useExportStore()
  const { selectedPageIds } = useSelectionStore()

  const canExport =
    selectedPageIds.length > 0 && options.outputDir.trim().length > 0 && !isExporting

  return (
    <div className="card-app mt-6 animate-fade-in stagger-5">
      <div className="px-6 py-5 border-b border-border">
        <h3 className="font-display text-lg font-semibold text-text-primary">Export</h3>
        <p className="text-sm text-text-secondary mt-1">
          Export selected pages to Obsidian-compatible Markdown
        </p>
      </div>

      <div className="px-6 py-5 space-y-5">
        <Input
          label="Output Directory"
          placeholder="~/Documents/confluence-export"
          value={options.outputDir}
          onChange={(value) => setOptions({ outputDir: value })}
        />

        <label className="flex items-start gap-4 cursor-pointer">
          <button
            type="button"
            onClick={() => setOptions({ includeAttachments: !options.includeAttachments })}
            className={`w-12 h-7 rounded-full transition-all duration-200 flex items-center ${
              options.includeAttachments ? 'bg-accent' : 'bg-border'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                options.includeAttachments ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <div className="flex-1">
            <span className="text-sm font-medium text-text-primary">Include Attachments</span>
            <span className="block text-xs text-text-muted mt-1">
              Download images and files into an attachments folder
            </span>
          </div>
        </label>

        <div className="space-y-2">
          <span className="text-sm font-medium text-text-primary">Export Format</span>
          <div className="rounded-lg border border-border bg-bg-elevated px-4 py-3 space-y-3">
            {([
              { value: 'markdown' as const, label: 'Markdown (.md)' },
              { value: 'html' as const, label: 'HTML (.html)' },
            ]).map((formatOption) => {
              const selected = options.format === formatOption.value
              return (
                <button
                  key={formatOption.value}
                  type="button"
                  onClick={() => setOptions({ format: formatOption.value })}
                  className={`w-full flex items-center justify-between gap-4 rounded-md px-2 py-1 transition-colors ${
                    selected ? 'text-text-primary' : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  <span className="text-sm">{formatOption.label}</span>
                  <span
                    className={`text-xs font-medium ${
                      selected ? 'text-accent' : 'text-text-muted'
                    }`}
                  >
                    {selected ? 'Selected' : 'Choose'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {error && (
          <p className="text-sm text-error">{error}</p>
        )}

        <div className="flex justify-end">
          <Button
            onClick={() => void startExport(selectedPageIds)}
            loading={isExporting}
            disabled={!canExport}
          >
            Export {selectedPageIds.length} Page{selectedPageIds.length === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ExportPanel
