import { useTranslation } from 'react-i18next'
import { useExportStore, ExportLogEntry } from '../../stores/exportStore'
import Button from '../common/Button'

function ProgressPanel() {
  const { t } = useTranslation(['export', 'common'])
  const { isExporting, progress, stats, logs, error, reset } = useExportStore()

  return (
    <div className="max-w-xl mx-auto mt-6 animate-fade-in stagger-6">
      <div className="card-app">
        <div className="px-8 py-6 border-b border-border">
          <h2 className="font-display text-xl font-semibold text-text-primary">{t('export:progress.title')}</h2>
          <p className="text-sm text-text-secondary mt-2">{t('export:progress.subtitle')}</p>
        </div>

        <div className="p-8 space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">{t('export:progress.progressLabel')}</span>
              <span className="font-medium text-text-primary">{progress}%</span>
            </div>
            <div className="progress-app">
              <div
                className={`progress-app-fill ${isExporting ? 'animate-pulse' : ''}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-5 gap-3">
            <Stat label={t('export:progress.stats.total')} value={stats.total} />
            <Stat label={t('export:progress.stats.exported')} value={stats.exported} color="blue" />
            <Stat label={t('export:progress.stats.skipped')} value={stats.skipped} color="orange" />
            <Stat label={t('export:progress.stats.failed')} value={stats.failed} color="red" />
            <Stat label={t('export:progress.stats.files')} value={stats.attachments} />
          </div>

          {error && (
            <div className="rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
              {error}
            </div>
          )}

          <div className="rounded-xl bg-bg-secondary overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-xs font-medium text-text-muted uppercase">
              {t('export:progress.logTitle')}
            </div>
            <div className="h-48 overflow-y-auto p-4 bg-bg-card">
              {logs.length === 0 ? (
                <div className="text-center py-8 text-text-muted text-sm">
                  {t('export:progress.emptyLog')}
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log, index) => (
                    <LogEntry key={`${log.timestamp}-${index}`} entry={log} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-8 py-6 bg-bg-secondary border-t border-border flex justify-end">
          <Button variant="secondary" onClick={reset} disabled={isExporting}>
            {t('common:buttons.reset')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: 'blue' | 'orange' | 'red' }) {
  const colors: Record<string, string> = {
    blue: 'text-accent',
    orange: 'text-[var(--color-app-orange)] dark:text-[var(--color-dark-orange)]',
    red: 'text-error',
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
    error: 'text-error',
  }
  return (
    <div className={`text-xs ${colors[entry.level]}`}>
      <span className="text-text-muted mr-2">{entry.timestamp}</span>
      <span className="text-text-primary">{entry.message}</span>
    </div>
  )
}

export default ProgressPanel
