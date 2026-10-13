import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import type { PageNode } from '../lib/contracts'
import { useSelectionStore } from './selectionStore'

vi.mock('../lib/api', () => ({ api: { getPageDescendants: vi.fn() } }))

function page(id: string, children: PageNode[] = [], childrenLoaded = true): PageNode {
  return { id, title: id, parentId: null, children, childrenLoaded, hasChildren: !childrenLoaded || children.length > 0 }
}

describe('page subtree selection', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useSelectionStore.setState({
      activeSpaceKey: 'SPACE',
      pageTrees: { SPACE: [page('root', [page('branch', [], false), page('sibling')])] },
      selectedPageIds: [],
      selectedPageTitles: {},
      selectedSubtreePageIds: {},
      loadingPageIds: [],
      error: null,
      errorCode: null,
    })
    vi.mocked(api.getPageDescendants).mockImplementation(async (id) =>
      id === 'root' ? [page('branch'), page('hidden-leaf'), page('sibling')] : [page('hidden-leaf')],
    )
  })

  it('excludes unloaded descendants when unchecking a branch selected through its parent', async () => {
    await useSelectionStore.getState().togglePageSubtreeSelection('root', 'root')
    expect(useSelectionStore.getState().selectedPageIds).toEqual(['root', 'branch', 'hidden-leaf', 'sibling'])

    await useSelectionStore.getState().togglePageSubtreeSelection('branch', 'branch')

    expect(useSelectionStore.getState().selectedPageIds).toEqual(['root', 'sibling'])
    expect(useSelectionStore.getState().selectedPageTitles).toEqual({ root: 'root', sibling: 'sibling' })
  })

  it('can reselect a partially selected parent and clear its whole subtree from the cache', async () => {
    await useSelectionStore.getState().togglePageSubtreeSelection('root', 'root')
    await useSelectionStore.getState().togglePageSubtreeSelection('branch', 'branch')
    await useSelectionStore.getState().togglePageSubtreeSelection('root', 'root', true)
    expect(useSelectionStore.getState().selectedPageIds).toEqual(['root', 'sibling', 'branch', 'hidden-leaf'])

    vi.mocked(api.getPageDescendants).mockClear()
    await useSelectionStore.getState().togglePageSubtreeSelection('root', 'root', false)
    expect(useSelectionStore.getState().selectedPageIds).toEqual([])
    expect(useSelectionStore.getState().selectedPageTitles).toEqual({})
    expect(api.getPageDescendants).not.toHaveBeenCalled()
  })

  it('keeps the selection intact and reports a failed descendant lookup', async () => {
    await useSelectionStore.getState().togglePageSubtreeSelection('root', 'root')
    const { selectedPageIds, selectedPageTitles } = useSelectionStore.getState()
    vi.mocked(api.getPageDescendants).mockRejectedValueOnce(new Error('Descendant lookup failed'))

    await useSelectionStore.getState().togglePageSubtreeSelection('branch', 'branch')

    expect(useSelectionStore.getState().selectedPageIds).toEqual(selectedPageIds)
    expect(useSelectionStore.getState().selectedPageTitles).toEqual(selectedPageTitles)
    expect(useSelectionStore.getState().loadingPageIds).toEqual([])
    expect(useSelectionStore.getState().error).toBeTruthy()
  })
})
