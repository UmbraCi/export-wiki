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
  isSearching: boolean
  error: string | null
  errorCode: string | null

  fetchSpaces: () => Promise<void>
  fetchPageTree: (spaceKey: string) => Promise<void>
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
