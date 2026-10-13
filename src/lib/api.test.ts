import { beforeEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { api } from './api'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn().mockResolvedValue(undefined) }))

beforeEach(() => vi.clearAllMocks())

it('requests session validation after the server rejects authentication', async () => {
  const error = JSON.stringify({ code: 'AUTH_REQUIRED' })
  vi.mocked(invoke).mockRejectedValue(error)
  await expect(api.getSpaces()).rejects.toBe(error)
  expect(emit).toHaveBeenCalledWith('auth-required')
})

it.each(['connection timed out', JSON.stringify({ code: 'FORBIDDEN' })])('keeps other errors from invalidating credentials', async (error) => {
  vi.mocked(invoke).mockRejectedValue(error)
  await expect(api.getSpaces()).rejects.toBe(error)
  expect(emit).not.toHaveBeenCalled()
})
