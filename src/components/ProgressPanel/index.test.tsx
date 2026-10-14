import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useExportStore } from '@/stores/exportStore'
import { api } from '@/lib/api'
import i18n from '@/i18n'
import ProgressPanel from './index'

vi.mock('@/lib/api', () => ({ api: { exportPages: vi.fn(), cancelExport: vi.fn() } }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))
vi.mock('../LogPanel', () => ({ default: () => <div /> }))
afterEach(cleanup)

it('retries the unfinished job from the error panel without selecting pages again', async () => {
  await i18n.changeLanguage('en')
  useExportStore.getState().reset()
  useExportStore.setState({
    error: 'Attachment download interrupted',
    resumeOptions: { pageIds: ['1', '2'], outputDir: '/saved', format: 'migration_package', includeAttachments: true },
  })
  vi.mocked(api.exportPages).mockResolvedValue({ exportId: 'done' })
  render(<ProgressPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Retry unfinished work' }))
  await waitFor(() => expect(api.exportPages).toHaveBeenCalledWith({
    pageIds: ['1', '2'], outputDir: '/saved', format: 'migration_package', includeAttachments: true,
  }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry unfinished work' })).toBeNull())
})
