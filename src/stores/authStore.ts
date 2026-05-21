import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import { api } from '../lib/api'
import type { AuthStatus, ManualAuthConfig, SsoSessionInfo, SsoSessionStatus } from '../lib/contracts'
import { translateInvokeError } from '../i18n/backend'
import i18n from '../i18n'

export type ManualAuthMode = ManualAuthConfig['method']

const unauthenticatedStatus: AuthStatus = {
  authenticated: false,
  method: null,
  baseUrl: null,
  displayName: null,
}

const inactiveSsoStatus: SsoSessionStatus = {
  active: false,
  entryUrl: null,
  currentUrl: null,
  wikiSessionDetected: false,
}

function authDiag(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.log(`[auth-diag] ${message}`, details)
  } else {
    console.log(`[auth-diag] ${message}`)
  }
}

function clientError(code: string): string {
  return i18n.t(`errors:${code}`)
}

function sanitizeError(error: unknown): string {
  const parsedCode = (() => {
    try {
      const message = error instanceof Error ? error.message : String(error)
      const parsed = JSON.parse(message) as { code?: string }
      return parsed.code ?? null
    } catch {
      return null
    }
  })()

  if (
    parsedCode === 'SSO_COOKIE_FALLBACK' ||
    parsedCode === 'COOKIE_VALIDATION_FAILED'
  ) {
    return translateInvokeError(error)
  }

  return translateInvokeError(error)
}

function cookieNamesFromHeader(header: string): string[] {
  return header
    .split(';')
    .map((part) => part.trim().split('=')[0]?.trim())
    .filter((name): name is string => Boolean(name))
}

function formatCurrentUrl(url: string | null): string {
  if (!url) return '—'
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

interface AuthState {
  status: AuthStatus
  baseUrl: string
  manualMode: ManualAuthMode | null
  isLoading: boolean
  error: string | null
  ssoSession: SsoSessionInfo | null
  ssoStatus: SsoSessionStatus

  setBaseUrl: (baseUrl: string) => void
  setManualMode: (mode: ManualAuthMode | null) => void
  loadStatus: () => Promise<void>
  startSsoLogin: () => Promise<void>
  refreshSsoStatus: () => Promise<void>
  navigateSsoWindow: (url?: string) => Promise<void>
  completeSsoLogin: () => Promise<void>
  cancelSsoLogin: () => Promise<void>
  saveManualAuth: (config: ManualAuthConfig) => Promise<void>
  logout: () => Promise<void>
  reconnectWithSso: () => Promise<void>
  updateSessionCookie: (cookie: string) => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: unauthenticatedStatus,
  baseUrl: '',
  manualMode: null,
  isLoading: false,
  error: null,
  ssoSession: null,
  ssoStatus: inactiveSsoStatus,

  setBaseUrl: (baseUrl) => set({ baseUrl }),

  setManualMode: (manualMode) => {
    authDiag('manual mode changed', { manualMode, baseUrl: get().baseUrl })
    set({ manualMode, error: null })
  },

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

    if (!baseUrl.startsWith('https://')) {
      set({
        error: clientError('CLIENT_INVALID_HTTPS_URL'),
        isLoading: false,
      })
      return
    }

    try {
      const ssoSession = await api.startSsoLogin(baseUrl)
      set({
        ssoSession,
        ssoStatus: {
          active: true,
          entryUrl: ssoSession.entryUrl,
          currentUrl: null,
          wikiSessionDetected: false,
        },
        isLoading: false,
      })
    } catch (error) {
      set({ error: sanitizeError(error), isLoading: false })
    }
  },

  refreshSsoStatus: async () => {
    const { ssoSession } = get()
    if (!ssoSession?.active) return

    try {
      const ssoStatus = await api.getSsoSessionStatus()
      if (!ssoStatus.active) {
        set({ ssoSession: null, ssoStatus: inactiveSsoStatus })
        return
      }
      set({ ssoStatus })
    } catch (error) {
      set({ error: sanitizeError(error) })
    }
  },

  navigateSsoWindow: async (url) => {
    const { ssoSession } = get()
    const targetUrl = url ?? ssoSession?.entryUrl
    if (!targetUrl) return

    set({ isLoading: true, error: null })

    try {
      await api.navigateSsoWindow(targetUrl)
      await get().refreshSsoStatus()
      set({ isLoading: false })
    } catch (error) {
      set({ error: sanitizeError(error), isLoading: false })
    }
  },

  completeSsoLogin: async () => {
    set({ isLoading: true, error: null })

    try {
      const status = await api.completeSsoLogin()
      set({
        status,
        ssoSession: null,
        ssoStatus: inactiveSsoStatus,
        isLoading: false,
      })
    } catch (error) {
      set({ error: sanitizeError(error), isLoading: false })
    }
  },

  cancelSsoLogin: async () => {
    set({ isLoading: true, error: null })

    try {
      await api.cancelSsoLogin()
      set({
        ssoSession: null,
        ssoStatus: inactiveSsoStatus,
        isLoading: false,
      })
    } catch (error) {
      set({ error: sanitizeError(error), isLoading: false })
    }
  },

  saveManualAuth: async (config) => {
    authDiag('saveManualAuth called', {
      method: config.method,
      baseUrl: config.baseUrl,
      hasUsername: Boolean(config.username),
      hasApiToken: Boolean(config.apiToken),
      cookieNames: config.cookie ? cookieNamesFromHeader(config.cookie) : [],
      cookieLength: config.cookie?.length ?? 0,
    })

    if (config.method === 'cookie' && !config.baseUrl) {
      authDiag('saveManualAuth blocked: missing baseUrl')
      set({ error: clientError('CLIENT_BASE_URL_REQUIRED_COOKIE'), isLoading: false })
      return
    }

    if (config.method === 'cookie' && !config.cookie?.trim()) {
      authDiag('saveManualAuth blocked: empty cookie')
      set({ error: clientError('CLIENT_SESSION_COOKIE_REQUIRED'), isLoading: false })
      return
    }

    set({ isLoading: true, error: null })

    try {
      const status = await api.saveManualAuth(config)
      authDiag('saveManualAuth succeeded', {
        authenticated: status.authenticated,
        method: status.method,
        baseUrl: status.baseUrl,
      })
      set({
        status,
        baseUrl: config.baseUrl,
        isLoading: false,
        manualMode: null,
      })
    } catch (error) {
      console.error('[auth-diag] saveManualAuth failed (raw)', error)
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
        ssoSession: null,
        ssoStatus: inactiveSsoStatus,
        isLoading: false,
      })
    } catch (error) {
      set({ error: sanitizeError(error), isLoading: false })
    }
  },

  reconnectWithSso: async () => {
    const preservedBaseUrl = get().status.baseUrl ?? get().baseUrl
    if (!preservedBaseUrl) {
      set({ error: clientError('CLIENT_BASE_URL_REQUIRED_SSO') })
      return
    }

    set({ isLoading: true, error: null })

    try {
      if (get().status.authenticated) {
        await api.logout()
      }
      set({
        status: unauthenticatedStatus,
        baseUrl: preservedBaseUrl,
        manualMode: null,
        ssoSession: null,
        ssoStatus: inactiveSsoStatus,
      })
      const ssoSession = await api.startSsoLogin(preservedBaseUrl)
      set({
        ssoSession,
        ssoStatus: {
          active: true,
          entryUrl: ssoSession.entryUrl,
          currentUrl: null,
          wikiSessionDetected: false,
        },
        isLoading: false,
      })
    } catch (error) {
      set({ error: sanitizeError(error), isLoading: false })
    }
  },

  updateSessionCookie: async (cookie) => {
    const baseUrl = get().status.baseUrl
    authDiag('updateSessionCookie called', {
      baseUrl,
      cookieNames: cookieNamesFromHeader(cookie),
      cookieLength: cookie.length,
    })

    if (!baseUrl) {
      authDiag('updateSessionCookie blocked: no saved baseUrl')
      set({ error: clientError('CLIENT_NO_SAVED_BASE_URL') })
      return
    }

    set({ isLoading: true, error: null })

    try {
      const status = await api.saveManualAuth({
        baseUrl,
        method: 'cookie',
        cookie,
      })
      authDiag('updateSessionCookie succeeded', {
        authenticated: status.authenticated,
        method: status.method,
      })
      set({ status, isLoading: false })
    } catch (error) {
      console.error('[auth-diag] updateSessionCookie failed (raw)', error)
      set({ error: sanitizeError(error), isLoading: false })
    }
  },

  clearError: () => set({ error: null }),
}))

let ssoListenersInitialized = false

export function initSsoEventListeners() {
  if (ssoListenersInitialized) return
  ssoListenersInitialized = true

  void listen<AuthStatus>('sso-auto-completed', (event) => {
    useAuthStore.setState({
      status: event.payload,
      ssoSession: null,
      ssoStatus: inactiveSsoStatus,
      isLoading: false,
      error: null,
    })
  })

  void listen<string>('sso-auto-complete-failed', (event) => {
    useAuthStore.setState({
      error: sanitizeError(event.payload),
      isLoading: false,
    })
  })
}

export { formatCurrentUrl }
