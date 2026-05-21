import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import { api } from '../lib/api'
import type { ExportOptions, ExportProgressEvent, ExportStats } from '../lib/contracts'

export interface ExportLogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export type ExportPanelOptions = Pick<ExportOptions, 'outputDir' | 'includeAttachments'>

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/token|cookie|password|secret/gi, '[redacted]')
}

function logLevelForStatus(status: ExportProgressEvent['status']): ExportLogEntry['level'] {
  if (status === 'failed') {
    return 'error'
  }
  if (status === 'complete') {
    return 'info'
  }
  return 'info'
}

interface ExportState {
  isExporting: boolean
  progress: number
  stats: ExportStats
  logs: ExportLogEntry[]
  options: ExportPanelOptions
  error: string | null

  setOptions: (options: Partial<ExportPanelOptions>) => void
  startExport: (pageIds: string[]) => Promise<void>
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
  progress: 0,
  stats: defaultStats,
  logs: [],
  options: {
    includeAttachments: true,
    outputDir: '',
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
            message: payload.message,
          },
        ],
      }))
    })

    try {
      await api.exportPages({
        pageIds,
        outputDir: options.outputDir,
        format: 'markdown',
        includeAttachments: options.includeAttachments,
      })
      set({ isExporting: false, progress: 100 })
    } catch (err) {
      set({
        error: sanitizeError(err),
        isExporting: false,
        logs: [
          ...get().logs,
          {
            timestamp: new Date().toLocaleTimeString(),
            level: 'error',
            message: sanitizeError(err),
          },
        ],
      })
    } finally {
      unlisten()
    }
  },

  reset: () =>
    set({
      isExporting: false,
      progress: 0,
      stats: defaultStats,
      logs: [],
      error: null,
    }),
}))
