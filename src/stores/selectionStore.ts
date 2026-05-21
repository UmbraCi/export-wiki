import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface Space {
  key: string
  name: string
  type?: string
}

export interface Page {
  id: string
  title: string
  spaceKey: string
  parentId?: string
}

interface SelectionState {
  spaces: Space[]
  pages: Page[]
  selectedSpaceKeys: string[]
  selectedPageIds: string[]
  isLoadingSpaces: boolean
  isLoadingPages: boolean
  error: string | null

  fetchSpaces: () => Promise<void>
  fetchPages: (spaceKey: string) => Promise<void>
  toggleSpaceSelection: (spaceKey: string) => void
  togglePageSelection: (pageId: string) => void
  clearSelection: () => void
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  spaces: [],
  pages: [],
  selectedSpaceKeys: [],
  selectedPageIds: [],
  isLoadingSpaces: false,
  isLoadingPages: false,
  error: null,

  fetchSpaces: async () => {
    set({ isLoadingSpaces: true, error: null })
    try {
      const spaces = await invoke<Space[]>('get_spaces')
      set({ spaces, isLoadingSpaces: false })
    } catch (err) {
      set({ error: String(err), isLoadingSpaces: false })
    }
  },

  fetchPages: async (spaceKey) => {
    set({ isLoadingPages: true, error: null })
    try {
      const pages = await invoke<Page[]>('get_pages', { spaceKey })
      set({ pages, isLoadingPages: false })
    } catch (err) {
      set({ error: String(err), isLoadingPages: false })
    }
  },

  toggleSpaceSelection: (spaceKey) => {
    const { selectedSpaceKeys } = get()
    const isSelected = selectedSpaceKeys.includes(spaceKey)
    set({
      selectedSpaceKeys: isSelected
        ? selectedSpaceKeys.filter(k => k !== spaceKey)
        : [...selectedSpaceKeys, spaceKey],
    })
  },

  togglePageSelection: (pageId) => {
    const { selectedPageIds } = get()
    const isSelected = selectedPageIds.includes(pageId)
    set({
      selectedPageIds: isSelected
        ? selectedPageIds.filter(id => id !== pageId)
        : [...selectedPageIds, pageId],
    })
  },

  clearSelection: () => set({
    selectedSpaceKeys: [],
    selectedPageIds: [],
  }),
}))