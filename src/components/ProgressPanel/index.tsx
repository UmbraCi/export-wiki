import { useTranslation } from 'react-i18next'
import { useExportStore } from '../../stores/exportStore'
import LogPanel from '../LogPanel'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'

function ProgressPanel() {
  const { t } = useTranslation(['export', 'common'])
  const {
    isExporting,
    isCancelling,
    progress,
    stats,
    error,
    reset,
    stopExport,
  } = useExportStore()

  return (
    <div className="max-w-4xl mx-auto mt-6">
      <Card className="gap-0 py-0">
        <div className="px-8 py-6 border-b border-border">
          <h2 className="font-sans text-xl font-semibold text-foreground">
            {t('export:progress.title')}
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            {t('export:progress.subtitle')}
          </p>
        </div>

        <div className="p-8 space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t('export:progress.progressLabel')}
              </span>
              <span className="font-medium text-foreground">{progress}%</span>
            </div>
            <Progress
              value={progress}
              aria-label={t('export:progress.progressLabel')}
            />
          </div>

          <div className="grid grid-cols-5 gap-3">
            <Stat
              label={t('export:progress.stats.total')}
              value={stats.total}
            />
            <Stat
              label={t('export:progress.stats.exported')}
              value={stats.exported}
              color="blue"
            />
            <Stat
              label={t('export:progress.stats.skipped')}
              value={stats.skipped}
              color="orange"
            />
            <Stat
              label={t('export:progress.stats.failed')}
              value={stats.failed}
              color="red"
            />
            <Stat
              label={t('export:progress.stats.files')}
              value={stats.attachments}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <LogPanel />
        </div>

        <div className="px-8 py-6 bg-muted border-t border-border flex justify-end gap-3">
          {isExporting && (
            <Button
              variant="secondary"
              onClick={() => void stopExport()}
              aria-busy={isCancelling}
              disabled={isCancelling}
            >
              {isCancelling && <Spinner aria-hidden="true" />}
              {isCancelling
                ? t('export:progress.stopping')
                : t('export:progress.stop')}
            </Button>
          )}
          <Button variant="secondary" onClick={reset} disabled={isExporting}>
            {t('common:buttons.reset')}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function Stat({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color?: 'blue' | 'orange' | 'red'
}) {
  const colors: Record<string, string> = {
    blue: 'text-primary',
    orange: 'text-amber-700 dark:text-amber-400',
    red: 'text-destructive',
  }
  return (
    <div className="text-center p-4 rounded-xl bg-accent">
      <span
        className={`font-sans text-2xl font-semibold ${colors[color || ''] || 'text-foreground'}`}
      >
        {value}
      </span>
      <span className="block text-xs text-muted-foreground mt-1">{label}</span>
    </div>
  )
}

export default ProgressPanel
