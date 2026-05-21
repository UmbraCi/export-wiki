import { create } from 'zustand'
import { api } from '../lib/api'
import type { PageNode, SpaceInfo } from '../lib/contracts'

interface SelectionState {
  spaces: SpaceInfo[]
  pageTrees: Record<string, PageNode[]>
  activeSpaceKey: string | null
  selectedPageIds: string[]
  selectedPageTitles: Record<string, string>
  isLoadingSpaces: boolean
  isLoadingPages: boolean
  error: string | null

  fetchSpaces: () => Promise<void>
  fetchPageTree: (spaceKey: string) => Promise<void>
  setActiveSpaceKey: (spaceKey: string) => void
  togglePageSelection: (pageId: string, title: string) => void
  clearSelection: () => void
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  spaces: [],
  pageTrees: {},
  activeSpaceKey: null,
  selectedPageIds: [],
  selectedPageTitles: {},
  isLoadingSpaces: false,
  isLoadingPages: false,
  error: null,

  fetchSpaces: async () => {
    set({ isLoadingSpaces: true, error: null })
    try {
      const spaces = await api.getSpaces()
      set({ spaces, isLoadingSpaces: false })
    } catch (err) {
      set({ error: String(err), isLoadingSpaces: false })
    }
  },

  fetchPageTree: async (spaceKey) => {
    set({ isLoadingPages: true, error: null })
    try {
      const pages = await api.getPageTree(spaceKey)
      set((state) => ({
        pageTrees: { ...state.pageTrees, [spaceKey]: pages },
        isLoadingPages: false,
      }))
    } catch (err) {
      set({ error: String(err), isLoadingPages: false })
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
}))
