import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import i18n from '@/i18n'
import { defaultConfig, useConfigStore } from '@/stores/configStore'
import { useSelectionStore } from '@/stores/selectionStore'
import SettingsPanel from './index'

beforeEach(async () => {
  await i18n.changeLanguage('en')
  useConfigStore.setState({
    config: defaultConfig,
    isLoading: false,
    error: null,
  })
  useSelectionStore.setState({ selectedPageIds: ['selected-page'] })
  vi.spyOn(useConfigStore.getState(), 'loadConfig').mockResolvedValue()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('saves the settings draft once, including switch state and selected sync pages', async () => {
  const save = vi
    .spyOn(useConfigStore.getState(), 'saveConfig')
    .mockResolvedValue()
  render(<SettingsPanel />)
  fireEvent.change(screen.getByLabelText('Output Directory'), {
    target: { value: '/tmp/export-test' },
  })
  fireEvent.click(screen.getByRole('switch', { name: 'Skip Unchanged' }))
  expect(save).not.toHaveBeenCalled()
  expect(
    screen
      .getByRole('switch', { name: 'Skip Unchanged' })
      .getAttribute('aria-checked'),
  ).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultOutputDir: '/tmp/export-test',
        skipUnchangedDefault: true,
        sync: expect.objectContaining({ pageIds: ['selected-page'] }),
      }),
    ),
  )
})

it('disables inactive sync inputs and blocks an invalid enabled interval', async () => {
  const save = vi
    .spyOn(useConfigStore.getState(), 'saveConfig')
    .mockResolvedValue()
  render(<SettingsPanel />)
  const interval = screen.getByLabelText('Sync Interval (minutes)')
  expect(interval.closest('fieldset')?.disabled).toBe(true)
  fireEvent.click(
    screen.getByRole('switch', { name: 'Enable Background Sync' }),
  )
  fireEvent.change(interval, { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
  await waitFor(() =>
    expect(interval.getAttribute('aria-invalid')).toBe('true'),
  )
  expect(save).not.toHaveBeenCalled()
})
