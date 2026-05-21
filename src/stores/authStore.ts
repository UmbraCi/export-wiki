import { create } from 'zustand'
import { api } from '../lib/api'
import type { AuthStatus, ManualAuthConfig } from '../lib/contracts'

export type ManualAuthMode = ManualAuthConfig['method']

const unauthenticatedStatus: AuthStatus = {
  authenticated: false,
  method: null,
  baseUrl: null,
  displayName: null,
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/token|cookie|password|secret/gi, '[redacted]')
}

interface AuthState {
  status: AuthStatus
  baseUrl: string
  manualMode: ManualAuthMode | null
  isLoading: boolean
  error: string | null

  setBaseUrl: (baseUrl: string) => void
  setManualMode: (mode: ManualAuthMode | null) => void
  loadStatus: () => Promise<void>
  startSsoLogin: () => Promise<void>
  saveManualAuth: (config: ManualAuthConfig) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: unauthenticatedStatus,
  baseUrl: '',
  manualMode: null,
  isLoading: false,
  error: null,

  setBaseUrl: (baseUrl) => set({ baseUrl }),

  setManualMode: (manualMode) => set({ manualMode, error: null }),

  loadStatus: async () => {
    set({ isLoading: true, error: null })

    try {
      const status = await api.getAuthStatus()
      set({
        status,
        baseUrl: status.baseUrl ?? get().baseUrl,
        isLoading: false,
      })
    } catch (error) {
      set({ error: sanitizeError(error), isLoading: false })
    }
  },

  startSsoLogin: async () => {
    const { baseUrl } = get()
    set({ isLoading: true, error: null })

    try {
      const status = await api.startSsoLogin(baseUrl)
      set({ status, isLoading: false })
    } catch (error) {
      set({ error: sanitizeError(error), isLoading: false })
    }
  },

  saveManualAuth: async (config) => {
    set({ isLoading: true, error: null })

    try {
      const status = await api.saveManualAuth(config)
      set({
        status,
        baseUrl: config.baseUrl,
        isLoading: false,
        manualMode: null,
      })
    } catch (error) {
      set({ error: sanitizeError(error), isLoading: false })
    }
  },

  logout: async () => {
    set({ isLoading: true, error: null })

    try {
      const status = await api.logout()
      set({
        status,
        baseUrl: '',
        manualMode: null,
        isLoading: false,
      })
    } catch (error) {
      set({ error: sanitizeError(error), isLoading: false })
    }
  },

  clearError: () => set({ error: null }),
}))
