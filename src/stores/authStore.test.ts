import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { useAuthStore } from './authStore'

vi.mock('../lib/api', () => ({
  api: {
    getAuthStatus: vi.fn(), startSsoLogin: vi.fn(), logout: vi.fn(), saveManualAuth: vi.fn(),
  },
}))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))

const saved = { authenticated: true, method: 'sso' as const, baseUrl: 'https://wiki.example.com', displayName: null }

describe('saved authentication', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useAuthStore.setState({ status: { ...saved, authenticated: false, baseUrl: null }, baseUrl: '', isLoading: false, error: null })
  })

  it('restores the verified session without opening a login window', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValue(saved)
    await useAuthStore.getState().loadStatus()
    expect(useAuthStore.getState().status.authenticated).toBe(true)
    expect(useAuthStore.getState().baseUrl).toBe(saved.baseUrl)
    expect(api.startSsoLogin).not.toHaveBeenCalled()
  })

  it.each(['SESSION_EXPIRED', 'AUTH_CHECK_FAILED'])('keeps the URL and displays %s without opening login', async (validationError) => {
    vi.mocked(api.getAuthStatus).mockResolvedValue({ ...saved, authenticated: false, validationError })
    await useAuthStore.getState().loadStatus()
    expect(useAuthStore.getState().status.authenticated).toBe(false)
    expect(useAuthStore.getState().baseUrl).toBe(saved.baseUrl)
    expect(useAuthStore.getState().error).toBeTruthy()
    expect(api.startSsoLogin).not.toHaveBeenCalled()
  })

  it('retries a saved connection after network failure', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValueOnce({ ...saved, authenticated: false, validationError: 'AUTH_CHECK_FAILED' }).mockResolvedValueOnce(saved)
    await useAuthStore.getState().loadStatus()
    await useAuthStore.getState().loadStatus()
    expect(useAuthStore.getState().error).toBeNull()
    expect(useAuthStore.getState().status.authenticated).toBe(true)
  })

  it('does not delete saved credentials before attempting SSO again', async () => {
    useAuthStore.setState({ status: saved })
    vi.mocked(api.startSsoLogin).mockResolvedValue({ active: true, entryUrl: saved.baseUrl, baseUrl: saved.baseUrl })
    await useAuthStore.getState().reconnectWithSso()
    expect(api.logout).not.toHaveBeenCalled()
    expect(api.startSsoLogin).toHaveBeenCalledWith(saved.baseUrl)
  })

  it('shows partial logout failure while keeping the UI signed out', async () => {
    vi.mocked(api.logout).mockResolvedValue({ ...saved, authenticated: false, validationError: 'BROWSER_SESSION_CLEAR_FAILED' })
    await useAuthStore.getState().logout()
    expect(useAuthStore.getState().status.authenticated).toBe(false)
    expect(useAuthStore.getState().error).toBeTruthy()
  })
})
