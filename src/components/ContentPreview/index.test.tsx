import { afterEach, expect, it } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import i18n from '@/i18n'
import { useSelectionStore } from '@/stores/selectionStore'
import ContentPreview from './index'

afterEach(cleanup)

it('sorts preview rows without changing the export selection and clears all selected pages', async () => {
  await i18n.changeLanguage('en')
  useSelectionStore.setState({
    selectedPageIds: ['b', 'a'],
    selectedPageTitles: { b: 'Zulu', a: 'Alpha' },
  })
  render(<ContentPreview />)
  fireEvent.click(screen.getByRole('button', { name: 'Page title' }))
  const rows = within(screen.getByRole('table')).getAllByRole('row')
  expect(within(rows[1]).getAllByRole('cell')[0].textContent).toBe('Alpha')
  expect(useSelectionStore.getState().selectedPageIds).toEqual(['b', 'a'])
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
  expect(useSelectionStore.getState().selectedPageIds).toEqual([])
  expect(screen.queryByRole('table')).toBeNull()
})
