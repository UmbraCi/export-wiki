import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export type AuthMethod = 'api_token' | 'cookie' | 'password'

export interface AuthConfig {
  url: string
  method: AuthMethod
  username?: string
  apiToken?: string
  password?: string
  cookies?: string
}

interface AuthState {
  credentials: AuthConfig | null
  isAuthenticated: boolean
  authMethod: AuthMethod
  isTesting: boolean
  error: string | null

  setAuthMethod: (method: AuthMethod) => void
  setCredentials: (config: AuthConfig) => void
  testConnection: () => Promise<boolean>
  logout: () => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  credentials: null,
  isAuthenticated: false,
  authMethod: 'api_token',
  isTesting: false,
  error: null,

  setAuthMethod: (method) => set({ authMethod: method }),

  setCredentials: (config) => set({ credentials: config }),

  testConnection: async () => {
    const { credentials } = get()
    if (!credentials) {
      set({ error: 'No credentials configured' })
      return false
    }

    set({ isTesting: true, error: null })

    try {
      await invoke('auth_configure', { config: credentials })
      const result = await invoke<{ success: boolean; message: string }>('auth_test')

      if (result.success) {
        set({ isAuthenticated: true, isTesting: false })
        return true
      } else {
        set({ error: result.message, isTesting: false })
        return false
      }
    } catch (err) {
      set({ error: String(err), isTesting: false })
      return false
    }
  },

  logout: () => set({
    credentials: null,
    isAuthenticated: false,
    authMethod: 'api_token',
    error: null,
  }),

  clearError: () => set({ error: null }),
}))