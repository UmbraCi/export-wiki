import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { listen } from '@tauri-apps/api/event'
import { api } from '../lib/api'
import { useExportStore, type ExportLogEntry } from './exportStore'

vi.mock('../lib/api', () => ({
  api: { exportPages: vi.fn(), cancelExport: vi.fn() },
}))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
  useExportStore.getState().reset()
  vi.mocked(listen).mockResolvedValue(vi.fn())
})
afterEach(() => vi.useRealTimers())

it('cleans up a partial listener setup and resets exporting after subscription failure', async () => {
  const cleanup = vi.fn()
  vi.mocked(listen)
    .mockResolvedValueOnce(cleanup)
    .mockRejectedValueOnce(new Error('event bridge failed'))
  await useExportStore.getState().startExport(['1'])
  expect(useExportStore.getState().isExporting).toBe(false)
  expect(useExportStore.getState().logs.slice(-1)[0]).toMatchObject({
    level: 'error',
    message: 'event bridge failed',
  })
  expect(cleanup).toHaveBeenCalledOnce()
  expect(api.exportPages).not.toHaveBeenCalled()
})

it('receives detailed logs while export is pending, warns on inactivity, and removes listeners', async () => {
  vi.useFakeTimers()
  let finish!: (value: { exportId: string }) => void
  vi.mocked(api.exportPages).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const unlisten = vi.fn()
  vi.mocked(listen).mockResolvedValue(unlisten)
  const pending = useExportStore.getState().startExport(['1'])
  await vi.waitFor(() => expect(api.exportPages).toHaveBeenCalled())
  const logListener = vi
    .mocked(listen)
    .mock.calls.find(([name]) => name === 'export-log')![1]
  const entry: ExportLogEntry = {
    timestamp: new Date().toISOString(),
    level: 'debug',
    source: 'sidecar',
    message: 'fetching page_id=1',
  }
  logListener({ event: 'export-log', id: 1, payload: entry })
  expect(useExportStore.getState().logs.slice(-1)[0]).toEqual(entry)
  await vi.advanceTimersByTimeAsync(35_000)
  expect(useExportStore.getState().logs.slice(-1)[0]?.level).toBe('warn')
  finish({ exportId: 'done' })
  await pending
  expect(unlisten).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})

it('bounds log history and persists the selected level and unfinished export', () => {
  const entry: ExportLogEntry = {
    timestamp: '2026-10-13T00:00:00Z',
    level: 'info',
    message: 'old',
  }
  useExportStore.setState({ logs: Array.from({ length: 5000 }, () => entry) })
  useExportStore.getState().addLog({ ...entry, message: 'new' })
  useExportStore.getState().setLogLevel('debug')
  expect(useExportStore.getState().logs).toHaveLength(5000)
  expect(useExportStore.getState().logs.slice(-1)[0]?.message).toBe('new')
  expect(
    JSON.parse(localStorage.getItem('export-log-preferences')!).state,
  ).toEqual({ logLevel: 'debug', resumeOptions: null })
})

it('logs every selected page ID and retries the original selection and options after failure', async () => {
  useExportStore.getState().setOptions({ format: 'migration_package', outputDir: '/original' })
  vi.mocked(api.exportPages).mockRejectedValueOnce(new Error('connection interrupted'))
  await useExportStore.getState().startExport(['123', '456'])
  expect(useExportStore.getState().logs[0].message).toContain('123, 456')
  expect(useExportStore.getState().resumeOptions?.pageIds).toEqual(['123', '456'])
  useExportStore.getState().setOptions({ format: 'html', outputDir: '/other' })
  vi.mocked(api.exportPages).mockResolvedValueOnce({ exportId: 'done' })
  await useExportStore.getState().resumeExport()
  expect(api.exportPages).toHaveBeenLastCalledWith({ pageIds: ['123', '456'], format: 'migration_package', outputDir: '/original', includeAttachments: true })
  expect(useExportStore.getState().resumeOptions).toBeNull()
})

it('pauses a running export and preserves its continuation after cancellation settles', async () => {
  let fail!: (error: Error) => void
  vi.mocked(api.exportPages).mockReturnValue(new Promise((_, reject) => { fail = reject }))
  const pending = useExportStore.getState().startExport(['1'])
  await vi.waitFor(() => expect(api.exportPages).toHaveBeenCalled())
  await useExportStore.getState().stopExport()
  fail(new Error('EXPORT_CANCELLED'))
  await pending
  expect(useExportStore.getState()).toMatchObject({ isExporting: false, isPaused: true, error: null, resumeOptions: { pageIds: ['1'] } })
})
