import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { defaultSyncSettings, type SyncSettings } from '../lib/contracts'

export interface Config {
  defaultOutputDir: string
  defaultFormat: 'markdown' | 'html'
  includeAttachmentsDefault: boolean
  skipUnchangedDefault: boolean
  lastUsedUrl?: string
  sync: SyncSettings
}

export const defaultConfig: Config = {
  defaultOutputDir: '',
  defaultFormat: 'markdown',
  includeAttachmentsDefault: true,
  skipUnchangedDefault: false,
  sync: defaultSyncSettings,
}

interface ConfigState {
  config: Config | null
  isLoading: boolean
  error: string | null

  loadConfig: () => Promise<void>
  saveConfig: (config: Config) => Promise<void>
  updateConfig: (updates: Partial<Config>) => void
  updateSyncSettings: (updates: Partial<SyncSettings>) => void
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  isLoading: false,
  error: null,

  loadConfig: async () => {
    set({ isLoading: true, error: null })
    try {
      const loaded = await invoke<Config | null>('load_config')
      const config: Config = loaded
        ? { ...defaultConfig, ...loaded, sync: { ...defaultSyncSettings, ...loaded.sync } }
        : defaultConfig
      set({ config, isLoading: false })
    } catch (err) {
      set({ error: String(err), isLoading: false })
    }
  },

  saveConfig: async (config) => {
    set({ isLoading: true, error: null })
    try {
      await invoke('save_config', { config })
      set({ config, isLoading: false })
    } catch (err) {
      set({ error: String(err), isLoading: false })
    }
  },

  updateConfig: (updates) => {
    const { config } = get()
    if (config) {
      set({ config: { ...config, ...updates } })
    }
  },

  updateSyncSettings: (updates) => {
    const { config } = get()
    if (config) {
      set({ config: { ...config, sync: { ...config.sync, ...updates } } })
    }
  },
}))
