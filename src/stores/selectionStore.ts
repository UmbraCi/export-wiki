import { create } from 'zustand'
import { api } from '../lib/api'
import type { PageNode, SearchResult, SpaceInfo } from '../lib/contracts'
import { getErrorCode, translateInvokeError } from '../i18n/backend'

interface SelectionState {
  spaces: SpaceInfo[]
  pageTrees: Record<string, PageNode[]>
  activeSpaceKey: string | null
  selectedPageIds: string[]
  selectedPageTitles: Record<string, string>
  searchQuery: string
  searchResults: SearchResult[]
  urlInput: string
  isLoadingSpaces: boolean
  isLoadingPages: boolean
  loadingPageIds: string[]
  selectedSubtreePageIds: Record<string, string[]>
  isSearching: boolean
  error: string | null
  errorCode: string | null

  fetchSpaces: () => Promise<void>
  fetchPageTree: (spaceKey: string) => Promise<void>
  fetchPageChildren: (pageId: string) => Promise<void>
  togglePageSubtreeSelection: (pageId: string, title: string, checked?: boolean) => Promise<void>
  setActiveSpaceKey: (spaceKey: string) => void
  togglePageSelection: (pageId: string, title: string) => void
  clearSelection: () => void
  setSearchQuery: (query: string) => void
  searchPages: (query: string) => Promise<void>
  clearSearchResults: () => void
  selectSearchResult: (result: SearchResult) => void
  setUrlInput: (url: string) => void
  navigateFromUrl: (url: string) => Promise<void>
}

function setSelectionError(error: unknown) {
  return {
    error: translateInvokeError(error),
    errorCode: getErrorCode(error),
  }
}

function findPageNode(nodes: PageNode[], pageId: string): PageNode | undefined {
  for (const node of nodes) {
    if (node.id === pageId) return node
    const found = findPageNode(node.children, pageId)
    if (found) return found
  }
  return undefined
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  spaces: [],
  pageTrees: {},
  activeSpaceKey: null,
  selectedPageIds: [],
  selectedPageTitles: {},
  searchQuery: '',
  searchResults: [],
  urlInput: '',
  isLoadingSpaces: false,
  isLoadingPages: false,
  loadingPageIds: [],
  selectedSubtreePageIds: {},
  isSearching: false,
  error: null,
  errorCode: null,

  fetchSpaces: async () => {
    set({ isLoadingSpaces: true, error: null, errorCode: null })
    try {
      const spaces = await api.getSpaces()
      set({ spaces, isLoadingSpaces: false })
    } catch (err) {
      set({ ...setSelectionError(err), isLoadingSpaces: false })
    }
  },

  fetchPageTree: async (spaceKey) => {
    set({ isLoadingPages: true, error: null, errorCode: null })
    try {
      const pages = await api.getPageTree(spaceKey)
      set((state) => ({
        pageTrees: { ...state.pageTrees, [spaceKey]: pages },
        isLoadingPages: false,
      }))
    } catch (err) {
      set({ ...setSelectionError(err), isLoadingPages: false })
    }
  },

  fetchPageChildren: async (pageId) => {
    const { activeSpaceKey } = get()
    if (!activeSpaceKey || get().loadingPageIds.includes(pageId)) return

    set((state) => ({ loadingPageIds: [...state.loadingPageIds, pageId] }))
    try {
      const children = await api.getPageChildren(pageId)
      const updateNodes = (nodes: PageNode[]): PageNode[] =>
        nodes.map((node) => {
          if (node.id === pageId) {
            return { ...node, children, childrenLoaded: true, hasChildren: children.length > 0 }
          }
          return { ...node, children: updateNodes(node.children) }
        })

      set((state) => ({
        pageTrees: {
          ...state.pageTrees,
          [activeSpaceKey]: updateNodes(state.pageTrees[activeSpaceKey] ?? []),
        },
        loadingPageIds: state.loadingPageIds.filter((id) => id !== pageId),
      }))
    } catch (err) {
      set((state) => ({
        ...setSelectionError(err),
        loadingPageIds: state.loadingPageIds.filter((id) => id !== pageId),
      }))
    }
  },

  togglePageSubtreeSelection: async (pageId, _title, checked) => {
    const { activeSpaceKey, pageTrees, selectedPageIds } = get()
    if (!activeSpaceKey || get().loadingPageIds.includes(pageId)) return

    const current = findPageNode(pageTrees[activeSpaceKey] ?? [], pageId)
    if (!current) return

    const shouldSelect = checked ?? !selectedPageIds.includes(pageId)
    const cachedIds = get().selectedSubtreePageIds[pageId]

    set((state) => ({
      loadingPageIds: [...state.loadingPageIds, pageId],
      error: null,
      errorCode: null,
    }))

    try {
      const subtree = !shouldSelect && cachedIds ? [] : [current, ...await api.getPageDescendants(pageId)]
      const subtreeIds = !shouldSelect && cachedIds ? cachedIds : subtree.map((node) => node.id)
      const removedIds = new Set(subtreeIds)
      set((state) => {
        const nextTitles = { ...state.selectedPageTitles }
        if (shouldSelect) {
          Object.assign(nextTitles, Object.fromEntries(subtree.map((node) => [node.id, node.title])))
        } else {
          subtreeIds.forEach((id) => delete nextTitles[id])
        }
        return {
          selectedPageIds: shouldSelect
            ? [...new Set([...state.selectedPageIds, ...subtreeIds])]
            : state.selectedPageIds.filter((id) => !removedIds.has(id)),
          selectedPageTitles: nextTitles,
          selectedSubtreePageIds: {
            ...state.selectedSubtreePageIds,
            [pageId]: subtreeIds,
          },
          loadingPageIds: state.loadingPageIds.filter((id) => id !== pageId),
        }
      })
    } catch (err) {
      set((state) => ({
        ...setSelectionError(err),
        loadingPageIds: state.loadingPageIds.filter((id) => id !== pageId),
      }))
    }
  },

  setActiveSpaceKey: (spaceKey) => {
    set({ activeSpaceKey: spaceKey })
    const { pageTrees, fetchPageTree } = get()
    if (!pageTrees[spaceKey]) {
      void fetchPageTree(spaceKey)
    }
  },

  togglePageSelection: (pageId, title) => {
    const { selectedPageIds, selectedPageTitles } = get()
    const isSelected = selectedPageIds.includes(pageId)

    if (isSelected) {
      const nextTitles = { ...selectedPageTitles }
      delete nextTitles[pageId]
      set({
        selectedPageIds: selectedPageIds.filter((id) => id !== pageId),
        selectedPageTitles: nextTitles,
      })
      return
    }

    set({
      selectedPageIds: [...selectedPageIds, pageId],
      selectedPageTitles: { ...selectedPageTitles, [pageId]: title },
    })
  },

  clearSelection: () =>
    set({
      selectedPageIds: [],
      selectedPageTitles: {},
      selectedSubtreePageIds: {},
    }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  searchPages: async (query) => {
    const trimmed = query.trim()
    if (!trimmed) {
      set({ searchResults: [], error: null, errorCode: null })
      return
    }

    set({ isSearching: true, error: null, errorCode: null, searchQuery: trimmed })
    try {
      const searchResults = await api.searchPages(trimmed)
      set({ searchResults, isSearching: false })
    } catch (err) {
      set({ ...setSelectionError(err), isSearching: false })
    }
  },

  clearSearchResults: () => set({ searchResults: [], searchQuery: '' }),

  selectSearchResult: (result) => {
    const { setActiveSpaceKey, togglePageSelection, selectedPageIds } = get()
    if (result.spaceKey) {
      setActiveSpaceKey(result.spaceKey)
    }
    if (!selectedPageIds.includes(result.pageId)) {
      togglePageSelection(result.pageId, result.title)
    }
  },

  setUrlInput: (url) => set({ urlInput: url }),

  navigateFromUrl: async (url) => {
    const trimmed = url.trim()
    if (!trimmed) {
      return
    }

    set({ error: null, errorCode: null, urlInput: trimmed })
    try {
      const target = await api.parseConfluenceUrl(trimmed)
      const { setActiveSpaceKey, togglePageSelection, selectedPageIds } = get()

      if (target.spaceKey) {
        setActiveSpaceKey(target.spaceKey)
      }

      if (target.pageId && !selectedPageIds.includes(target.pageId)) {
        togglePageSelection(target.pageId, target.pageId)
      }
    } catch (err) {
      set(setSelectionError(err))
    }
  },
}))
