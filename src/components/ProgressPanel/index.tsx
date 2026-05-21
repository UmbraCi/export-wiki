import { useExportStore, ExportLogEntry } from '../../stores/exportStore'
import Button from '../common/Button'

function ProgressPanel() {
  const { isExporting, progress, stats, logs, startExport, cancelExport, reset } = useExportStore()

  return (
    <div className="max-w-xl mx-auto animate-fade-in stagger-2">
      <div className="card-app">
        {/* Header */}
        <div className="px-8 py-6 border-b border-border">
          <h2 className="font-display text-xl font-semibold text-text-primary">Export Progress</h2>
          <p className="text-sm text-text-secondary mt-2">Track your export status</p>
        </div>

        {/* Progress */}
        <div className="p-8 space-y-6">
          {/* Bar */}
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Progress</span>
              <span className="font-medium text-text-primary">{progress}%</span>
            </div>
            <div className="progress-app">
              <div className={`progress-app-fill ${isExporting ? 'animate-pulse' : ''}`} style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-5 gap-3">
            <Stat label="Total" value={stats.total} />
            <Stat label="Exported" value={stats.exported} color="blue" />
            <Stat label="Skipped" value={stats.skipped} color="orange" />
            <Stat label="Failed" value={stats.failed} color="red" />
            <Stat label="Files" value={stats.attachments} />
          </div>

          {/* Log */}
          <div className="rounded-xl bg-bg-secondary overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-xs font-medium text-text-muted uppercase">
              Export Log
            </div>
            <div className="h-48 overflow-y-auto p-4 bg-bg-card">
              {logs.length === 0 ? (
                <div className="text-center py-8 text-text-muted text-sm">No logs</div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log, i) => <LogEntry key={i} entry={log} />)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-bg-secondary border-t border-border flex justify-between">
          <Button variant="secondary" onClick={reset} disabled={isExporting}>Reset</Button>
          <div className="flex gap-3">
            {isExporting && <Button variant="ghost" onClick={cancelExport}>Cancel</Button>}
            <Button onClick={startExport} loading={isExporting} disabled={progress === 100}>
              {progress === 100 ? 'Complete' : 'Start Export'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: 'blue' | 'orange' | 'red' }) {
  const colors: Record<string, string> = {
    blue: 'text-accent',
    orange: 'text-[var(--color-app-orange)] dark:text-[var(--color-dark-orange)]',
    red: 'text-error'
  }
  return (
    <div className="text-center p-4 rounded-xl bg-bg-elevated">
      <span className={`font-display text-2xl font-semibold ${colors[color || ''] || 'text-text-primary'}`}>
        {value}
      </span>
      <span className="block text-xs text-text-muted mt-1">{label}</span>
    </div>
  )
}

function LogEntry({ entry }: { entry: ExportLogEntry }) {
  const colors: Record<string, string> = {
    info: 'text-text-muted',
    warn: 'text-[var(--color-app-orange)] dark:text-[var(--color-dark-orange)]',
    error: 'text-error'
  }
  return (
    <div className={`text-xs ${colors[entry.level]}`}>
      <span className="text-text-muted mr-2">{entry.timestamp}</span>
      <span className="text-text-primary">{entry.message}</span>
    </div>
  )
}

export default ProgressPanel