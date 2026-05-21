import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export interface ExportStats {
  total: number
  exported: number
  skipped: number
  failed: number
  attachments: number
}

export interface ExportLogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface ExportOptions {
  format: 'markdown' | 'html'
  includeAttachments: boolean
  outputDir: string
  skipUnchanged: boolean
}

interface ExportState {
  isExporting: boolean
  progress: number
  stats: ExportStats
  logs: ExportLogEntry[]
  options: ExportOptions
  error: string | null

  setOptions: (options: ExportOptions) => void
  startExport: () => Promise<void>
  cancelExport: () => Promise<void>
  addLog: (entry: ExportLogEntry) => void
  updateProgress: (progress: number, stats: ExportStats) => void
  reset: () => void
}

export const useExportStore = create<ExportState>((set, get) => ({
  isExporting: false,
  progress: 0,
  stats: { total: 0, exported: 0, skipped: 0, failed: 0, attachments: 0 },
  logs: [],
  options: {
    format: 'markdown',
    includeAttachments: true,
    outputDir: '',
    skipUnchanged: false,
  },
  error: null,

  setOptions: (options) => set({ options }),

  startExport: async () => {
    const { options } = get()
    set({ isExporting: true, progress: 0, error: null })

    try {
      // Listen for progress events from Tauri backend
      const unlisten = await listen<{ progress: number; stats: ExportStats }>('export-progress', (event) => {
        set({ progress: event.payload.progress, stats: event.payload.stats })
      })

      await invoke('start_export', { options })

      unlisten()
      set({ isExporting: false, progress: 100 })
    } catch (err) {
      set({ error: String(err), isExporting: false })
    }
  },

  cancelExport: async () => {
    try {
      await invoke('cancel_export')
      set({ isExporting: false })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  addLog: (entry) => set((state) => ({
    logs: [...state.logs, entry],
  })),

  updateProgress: (progress, stats) => set({ progress, stats }),

  reset: () => set({
    isExporting: false,
    progress: 0,
    stats: { total: 0, exported: 0, skipped: 0, failed: 0, attachments: 0 },
    logs: [],
    error: null,
  }),
}))