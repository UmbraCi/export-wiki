import { create } from 'zustand'

export type AppView = 'authentication' | 'spaces' | 'export' | 'settings' | 'logs'

interface NavState {
  activeView: AppView
  setActiveView: (view: AppView) => void
}

export const useNavStore = create<NavState>((set) => ({
  activeView: 'authentication',
  setActiveView: (activeView) => set({ activeView }),
}))

export const authRequiredViews: AppView[] = ['spaces', 'export']
