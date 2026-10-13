import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'
import { logLevels, useExportStore } from '@/stores/exportStore'
import { translateInvokeError } from '@/i18n/backend'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'

function LogPanel() {
  const { t } = useTranslation(['export', 'common'])
  const { logs, logLevel, setLogLevel, clearLogs } = useExportStore()
  const [search, setSearch] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const visible = logs.filter(
    (entry) =>
      logLevels.indexOf(entry.level) >= logLevels.indexOf(logLevel) &&
      `${entry.timestamp} ${entry.level} ${entry.source ?? ''} ${entry.message}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  const text = visible
    .map(
      (entry) =>
        `${entry.timestamp} [${entry.level.toUpperCase()}] [${entry.source ?? 'export'}] ${entry.message}`,
    )
    .join('\n')

  useEffect(() => {
    const element = scrollRef.current
    if (element && follow.current) element.scrollTop = element.scrollHeight
  }, [logs, search, logLevel])

  return (
    <section
      className="rounded-xl border bg-card overflow-hidden"
      aria-label={t('export:progress.logTitle')}
    >
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted px-4 py-3">
        <h2 className="text-sm font-semibold mr-auto">
          {t('export:progress.logTitle')}
        </h2>
        <label htmlFor="log-level" className="text-xs">
          {t('export:logs.level')}
        </label>
        <Select
          value={logLevel}
          onValueChange={(value) => {
            const level = logLevels.find((level) => level === value)
            if (level) setLogLevel(level)
          }}
        >
          <SelectTrigger id="log-level" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {logLevels.map((level) => (
              <SelectItem key={level} value={level}>
                {t(`export:logs.levels.${level}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-48"
          aria-label={t('export:logs.search')}
          placeholder={t('export:logs.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!visible.length}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              toast.success(t('export:logs.copied'))
            } catch (error) {
              toast.error(translateInvokeError(error))
            }
          }}
        >
          {t('export:logs.copy')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!visible.length}
          onClick={async () => {
            try {
              const path = await save({
                defaultPath: `export-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`,
                filters: [{ name: 'Log', extensions: ['txt'] }],
              })
              if (path) await invoke('save_log_file', { path, contents: text })
            } catch (error) {
              toast.error(translateInvokeError(error))
            }
          }}
        >
          {t('export:logs.download')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={clearLogs}
          disabled={!logs.length}
        >
          {t('common:buttons.clear')}
        </Button>
      </div>
      <p className="px-4 py-2 text-xs text-muted-foreground">
        {t('export:logs.retention', {
          count: visible.length,
          total: logs.length,
        })}
      </p>
      <div
        ref={scrollRef}
        className="h-72 overflow-auto px-4 pb-4 font-mono text-xs"
        onScroll={(event) => {
          const element = event.currentTarget
          follow.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 24
        }}
      >
        {visible.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {t(
              logs.length
                ? 'export:logs.noMatches'
                : 'export:progress.emptyLog',
            )}
          </p>
        ) : (
          visible.map((entry, index) => (
            <div
              key={`${entry.timestamp}-${index}`}
              className={`whitespace-pre-wrap break-all py-1 ${entry.level === 'error' ? 'text-destructive' : entry.level === 'warn' ? 'text-amber-700 dark:text-amber-400' : entry.level === 'debug' ? 'text-muted-foreground' : 'text-foreground'}`}
            >
              <time className="text-muted-foreground">
                {new Date(entry.timestamp).toLocaleString()}
              </time>{' '}
              <span>[{entry.level.toUpperCase()}]</span>{' '}
              <span className="text-muted-foreground">
                [{entry.source ?? 'export'}]
              </span>{' '}
              {entry.message}
            </div>
          ))
        )}
      </div>
    </section>
  )
}

export default LogPanel
