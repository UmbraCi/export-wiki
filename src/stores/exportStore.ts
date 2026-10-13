import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { listen } from '@tauri-apps/api/event'
import { api } from '../lib/api'
import type {
  ExportOptions,
  ExportProgressEvent,
  ExportStats,
} from '../lib/contracts'
import { translateInvokeError, translateProgressEvent } from '../i18n/backend'
import i18n from '../i18n'

export const logLevels = ['debug', 'info', 'warn', 'error'] as const
export type LogLevel = (typeof logLevels)[number]

export interface ExportLogEntry {
  timestamp: string
  level: LogLevel
  message: string
  source?: string
}

export type ExportPanelOptions = Pick<
  ExportOptions,
  'outputDir' | 'includeAttachments' | 'format'
>

function logLevelForStatus(
  status: ExportProgressEvent['status'],
): ExportLogEntry['level'] {
  if (status === 'failed') {
    return 'error'
  }
  return 'info'
}

interface ExportState {
  isExporting: boolean
  isCancelling: boolean
  cancelRequested: boolean
  progress: number
  stats: ExportStats
  logs: ExportLogEntry[]
  logLevel: LogLevel
  setLogLevel: (level: LogLevel) => void
  addLog: (entry: ExportLogEntry) => void
  clearLogs: () => void
  options: ExportPanelOptions
  error: string | null

  setOptions: (options: Partial<ExportPanelOptions>) => void
  startExport: (pageIds: string[]) => Promise<void>
  stopExport: () => Promise<void>
  reset: () => void
}

const defaultStats: ExportStats = {
  total: 0,
  exported: 0,
  skipped: 0,
  failed: 0,
  attachments: 0,
}

export const useExportStore = create<ExportState>()(
  persist(
    (set, get) => ({
      isExporting: false,
      isCancelling: false,
      cancelRequested: false,
      progress: 0,
      stats: defaultStats,
      logs: [],
      logLevel: 'info',
      setLogLevel: (logLevel) => set({ logLevel }),
      // shortcut: keep the latest 5,000 entries in memory; use disk history if longer sessions need it.
      addLog: (entry) =>
        set((state) => ({ logs: [...state.logs.slice(-4999), entry] })),
      clearLogs: () => set({ logs: [] }),
      options: {
        includeAttachments: true,
        outputDir: '',
        format: 'markdown',
      },
      error: null,

      setOptions: (options) =>
        set((state) => ({
          options: { ...state.options, ...options },
        })),

      startExport: async (pageIds) => {
        if (get().isExporting) return
        const { options } = get()
        set({
          isExporting: true,
          isCancelling: false,
          cancelRequested: false,
          progress: 0,
          error: null,
          stats: defaultStats,
        })
        const unlisteners: (() => void)[] = []
        let lastActivity = Date.now()
        let inactivityReported = false
        let watchdog: ReturnType<typeof setInterval> | undefined
        get().addLog({
          timestamp: new Date().toISOString(),
          level: 'info',
          source: 'export',
          message: i18n.t('export:logs.starting', {
            count: pageIds.length,
            format: options.format,
          }),
        })
        try {
          unlisteners.push(
            await listen<ExportLogEntry>('export-log', ({ payload }) => {
              lastActivity = Date.now()
              inactivityReported = false
              get().addLog(payload)
            }),
          )
          unlisteners.push(
            await listen<ExportProgressEvent>('export-progress', (event) => {
              const payload = event.payload
              lastActivity = Date.now()
              inactivityReported = false
              set((state) => ({
                progress: payload.progress,
                stats: payload.stats,
                logs: [
                  ...state.logs.slice(-4999),
                  {
                    timestamp: new Date().toISOString(),
                    level: logLevelForStatus(payload.status),
                    source: 'export',
                    message: [
                      payload.status,
                      payload.pageId && `page=${payload.pageId}`,
                      translateProgressEvent(payload),
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  },
                ],
              }))
            }),
          )
          watchdog = setInterval(() => {
            const seconds = Math.floor((Date.now() - lastActivity) / 1000)
            if (seconds >= 30 && !inactivityReported) {
              inactivityReported = true
              get().addLog({
                timestamp: new Date().toISOString(),
                level: 'warn',
                source: 'export',
                message: i18n.t('export:logs.waiting', { seconds }),
              })
            }
          }, 5_000)
          await api.exportPages({
            pageIds,
            outputDir: options.outputDir,
            format: options.format,
            includeAttachments: options.includeAttachments,
          })
          const cancelled = get().cancelRequested
          if (cancelled)
            get().addLog({
              timestamp: new Date().toISOString(),
              level: 'warn',
              source: 'export',
              message: i18n.t('export:logs.cancelled'),
            })
          set({
            isExporting: false,
            progress: cancelled ? get().progress : 100,
          })
        } catch (err) {
          const cancelled = get().cancelRequested
          const message = translateInvokeError(err)
          get().addLog({
            timestamp: new Date().toISOString(),
            level: cancelled ? 'warn' : 'error',
            source: 'export',
            message: cancelled ? i18n.t('export:logs.cancelled') : message,
          })
          set({
            error: cancelled ? null : message,
            isExporting: false,
          })
        } finally {
          if (watchdog) clearInterval(watchdog)
          unlisteners.forEach((unlisten) => unlisten())
          set({ isCancelling: false, cancelRequested: false })
        }
      },

      stopExport: async () => {
        if (!get().isExporting || get().isCancelling) return
        set({ isCancelling: true, cancelRequested: true })
        get().addLog({
          timestamp: new Date().toISOString(),
          level: 'warn',
          source: 'export',
          message: i18n.t('export:logs.stopping'),
        })
        try {
          await api.cancelExport()
        } catch (err) {
          get().addLog({
            timestamp: new Date().toISOString(),
            level: 'error',
            source: 'export',
            message: translateInvokeError(err),
          })
          set({
            isCancelling: false,
            cancelRequested: false,
            error: translateInvokeError(err),
          })
        }
      },

      reset: () =>
        set({
          isExporting: false,
          isCancelling: false,
          cancelRequested: false,
          progress: 0,
          stats: defaultStats,
          logs: [],
          error: null,
        }),
    }),
    {
      name: 'export-log-preferences',
      partialize: (state) => ({ logLevel: state.logLevel }),
    },
  ),
)
