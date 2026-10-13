import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { listen } from '@tauri-apps/api/event'
import { api } from '../../lib/api'
import type { PageNode } from '../../lib/contracts'
import { useSelectionStore } from '../../stores/selectionStore'
import { useExportStore } from '../../stores/exportStore'
import { useAuthStore } from '../../stores/authStore'
import { useConfigStore } from '../../stores/configStore'
import { useNavStore } from '../../stores/navStore'
import i18n from '../../i18n'
import ExportPanel from '../ExportPanel'
import SpaceBrowserContent from './index'
import SpaceBrowserFooter from './Footer'
import App from '../../App'

vi.mock('../../lib/api', () => ({
  api: {
    getSpaces: vi.fn(),
    getPageDescendants: vi.fn(),
    getPageChildren: vi.fn(),
    exportPages: vi.fn(),
  },
}))

function SpaceBrowser() {
  return <><SpaceBrowserContent /><SpaceBrowserFooter /></>
}
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'system', setTheme: vi.fn() }),
}))

function page(
  id: string,
  children: PageNode[] = [],
  childrenLoaded = true,
): PageNode {
  return {
    id,
    title: id,
    parentId: null,
    children,
    childrenLoaded,
    hasChildren: !childrenLoaded || children.length > 0,
  }
}

beforeEach(async () => {
  vi.resetAllMocks()
  await i18n.changeLanguage('en')
  useSelectionStore.setState({
    spaces: [],
    activeSpaceKey: 'SPACE',
    pageTrees: {
      SPACE: [page('root', [page('branch', [], false), page('sibling')])],
    },
    selectedPageIds: [],
    selectedPageTitles: {},
    selectedSubtreePageIds: {},
    loadingPageIds: [],
    searchResults: [],
    isSearching: false,
    isLoadingPages: false,
    error: null,
    errorCode: null,
  })
  useExportStore.getState().reset()
  useNavStore.setState({ activeView: 'spaces' })
  useExportStore
    .getState()
    .setOptions({ outputDir: '/tmp/export-wiki-selection-test' })
  vi.mocked(api.getSpaces).mockResolvedValue([])
  vi.mocked(api.getPageChildren).mockResolvedValue([page('hidden-leaf')])
  vi.mocked(api.getPageDescendants).mockImplementation(async (id) =>
    id === 'root'
      ? [page('branch'), page('hidden-leaf'), page('sibling')]
      : id === 'branch'
        ? [page('hidden-leaf')]
        : [],
  )
  vi.mocked(api.exportPages).mockResolvedValue({ exportId: 'test-export' })
  vi.mocked(listen).mockResolvedValue(vi.fn())
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('exports an Outline Markdown ZIP with attachments and no flatten option', async () => {
  useSelectionStore.setState({ selectedPageIds: ['root'] })
  render(<ExportPanel />)
  fireEvent.click(screen.getByRole('radio', { name: 'Outline migration package (.zip)' }))
  expect(screen.queryByText('Flatten import')).toBeNull()
  expect(screen.getByRole('switch', { name: 'Include Attachments' }).getAttribute('aria-checked')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Export 1 Page' }))
  await waitFor(() => expect(api.exportPages).toHaveBeenCalledWith({
    pageIds: ['root'],
    outputDir: '/tmp/export-wiki-selection-test',
    format: 'migration_package',
    includeAttachments: true,
  }))
})

it('opens export as a space subpage and preserves selection and tree expansion on return', async () => {
  useAuthStore.setState({
    status: {
      authenticated: true,
      method: 'cookie',
      baseUrl: 'https://wiki.example.com',
      displayName: null,
    },
  })
  vi.spyOn(useAuthStore.getState(), 'loadStatus').mockResolvedValue()
  vi.spyOn(useConfigStore.getState(), 'loadConfig').mockResolvedValue()
  render(<App />)

  expect(screen.queryByRole('button', { name: 'Export' })).toBeNull()
  const next = await screen.findByRole('button', { name: 'Next' })
  expect(next.hasAttribute('disabled')).toBe(true)
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select root' }))
  await waitFor(() => expect(next.hasAttribute('disabled')).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Expand root' }))
  fireEvent.click(next)

  expect(screen.getByRole('heading', { name: 'Export', level: 1 })).toBeTruthy()
  expect(
    screen.getByRole('button', { name: 'Spaces' }).getAttribute('aria-current'),
  ).toBe('page')
  expect(screen.queryByRole('checkbox', { name: 'Select root' })).toBeNull()
  expect(
    await screen.findByRole('button', { name: 'Export 4 Pages' }),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Back to spaces' }))

  expect(
    screen
      .getByRole('checkbox', { name: 'Select branch' })
      .getAttribute('aria-checked'),
  ).toBe('true')
  expect(useSelectionStore.getState().selectedPageIds).toHaveLength(4)
  expect(api.getSpaces).toHaveBeenCalledTimes(1)
})

it('waits for pending subtree selection before allowing the next step', () => {
  useSelectionStore.setState({
    selectedPageIds: ['root'],
    loadingPageIds: ['branch'],
  })
  render(<SpaceBrowser />)
  expect(
    screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled'),
  ).toBe(true)
})

it('unchecks a collapsed branch, exports only remaining pages, and restores a mixed parent', async () => {
  render(
    <>
      <SpaceBrowser />
      <ExportPanel />
    </>,
  )
  const root = screen.getByRole('checkbox', { name: 'Select root' })
  fireEvent.click(root)
  await waitFor(() =>
    expect(useSelectionStore.getState().selectedPageIds).toHaveLength(4),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Expand root' }))
  const branch = screen.getByRole('checkbox', { name: 'Select branch' })
  expect(branch.getAttribute('aria-checked')).toBe('true')
  fireEvent.click(branch)

  await waitFor(() =>
    expect(useSelectionStore.getState().selectedPageIds).toEqual([
      'root',
      'sibling',
    ]),
  )
  expect(root.getAttribute('aria-checked')).toBe('mixed')
  expect(branch.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: 'Export 2 Pages' }))
  await waitFor(() =>
    expect(api.exportPages).toHaveBeenCalledWith(
      expect.objectContaining({ pageIds: ['root', 'sibling'] }),
    ),
  )

  fireEvent.click(screen.getByRole('button', { name: 'Expand branch' }))
  const leaf = await screen.findByRole('checkbox', {
    name: 'Select hidden-leaf',
  })
  expect(leaf.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(root)
  await waitFor(() => expect(root.getAttribute('aria-checked')).toBe('true'))
  expect(branch.getAttribute('aria-checked')).toBe('true')
  expect(leaf.getAttribute('aria-checked')).toBe('true')

  fireEvent.click(leaf)
  await waitFor(() => expect(leaf.getAttribute('aria-checked')).toBe('false'))
  expect(branch.getAttribute('aria-checked')).toBe('mixed')
  expect(root.getAttribute('aria-checked')).toBe('mixed')
})
