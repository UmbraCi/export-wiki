import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import { useExportStore } from '@/stores/exportStore'
import i18n from '@/i18n'
import LogPanel from './index'

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
beforeEach(async () => {
  await i18n.changeLanguage('en')
  useExportStore.getState().reset()
  useExportStore.setState({
    logLevel: 'info',
    logs: [
      {
        timestamp: '2026-10-13T00:00:00Z',
        level: 'debug',
        source: 'sidecar',
        message: 'fetching page 1',
      },
      {
        timestamp: '2026-10-13T00:00:01Z',
        level: 'info',
        message: 'writing page 1',
      },
      {
        timestamp: '2026-10-13T00:00:02Z',
        level: 'error',
        message: 'HTTP 403 page 2',
      },
    ],
  })
})
afterEach(cleanup)

it('filters by minimum severity and search without discarding captured diagnostics', () => {
  render(<LogPanel />)
  expect(screen.queryByText('fetching page 1')).toBeNull()
  expect(screen.getByText('HTTP 403 page 2')).toBeTruthy()
  act(() => useExportStore.getState().setLogLevel('debug'))
  expect(screen.getByText('fetching page 1')).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox', { name: 'Search logs' }), {
    target: { value: '403' },
  })
  expect(screen.queryByText('writing page 1')).toBeNull()
  expect(screen.getByText('HTTP 403 page 2')).toBeTruthy()
  expect(useExportStore.getState().logs).toHaveLength(3)
})

it('clears logs while preserving the preferred level', () => {
  render(<LogPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  expect(useExportStore.getState().logs).toEqual([])
  expect(useExportStore.getState().logLevel).toBe('info')
})
