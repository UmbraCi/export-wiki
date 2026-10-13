import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import { api } from '../lib/api'
import type { ExportOptions, ExportProgressEvent, ExportStats } from '../lib/contracts'
import { translateInvokeError, translateProgressEvent } from '../i18n/backend'

export interface ExportLogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export type ExportPanelOptions = Pick<
  ExportOptions,
  'outputDir' | 'includeAttachments' | 'format' | 'flatten'
>

function logLevelForStatus(status: ExportProgressEvent['status']): ExportLogEntry['level'] {
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

export const useExportStore = create<ExportState>((set, get) => ({
  isExporting: false,
  isCancelling: false,
  cancelRequested: false,
  progress: 0,
  stats: defaultStats,
  logs: [],
  options: {
    includeAttachments: true,
    flatten: true,
    outputDir: '',
    format: 'markdown',
  },
  error: null,

  setOptions: (options) =>
    set((state) => ({
      options: { ...state.options, ...options },
    })),

  startExport: async (pageIds) => {
    const { options } = get()
    set({
      isExporting: true,
      isCancelling: false,
      cancelRequested: false,
      progress: 0,
      error: null,
      stats: defaultStats,
      logs: [],
    })

    const unlisten = await listen<ExportProgressEvent>('export-progress', (event) => {
      const payload = event.payload
      set((state) => ({
        progress: payload.progress,
        stats: payload.stats,
        logs: [
          ...state.logs,
          {
            timestamp: new Date().toLocaleTimeString(),
            level: logLevelForStatus(payload.status),
            message: translateProgressEvent(payload),
          },
        ],
      }))
    })

    try {
      await api.exportPages({
        pageIds,
        outputDir: options.outputDir,
        format: options.format,
        includeAttachments: options.includeAttachments,
        flatten: options.flatten,
      })
      const cancelled = get().cancelRequested
      set({ isExporting: false, progress: cancelled ? get().progress : 100 })
    } catch (err) {
      const cancelled = get().cancelRequested
      const message = translateInvokeError(err)
      set({
        error: cancelled ? null : message,
        isExporting: false,
        logs: cancelled
          ? get().logs
          : [
              ...get().logs,
              {
                timestamp: new Date().toLocaleTimeString(),
                level: 'error' as const,
                message,
              },
            ],
      })
    } finally {
      unlisten()
      set({ isCancelling: false, cancelRequested: false })
    }
  },

  stopExport: async () => {
    if (!get().isExporting || get().isCancelling) return
    set({ isCancelling: true, cancelRequested: true })
    try {
      await api.cancelExport()
    } catch (err) {
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
}))
