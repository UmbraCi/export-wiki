import { create } from 'zustand'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  const systemTheme = getSystemTheme()

  // Remove existing theme classes
  root.classList.remove('light-mode', 'dark-mode')

  if (mode === 'dark') {
    root.classList.add('dark-mode')
  } else if (mode === 'light') {
    root.classList.add('light-mode')
  }
  // 'system' mode: no classes, let CSS media query handle it

  // Store preference
  localStorage.setItem('theme-mode', mode)
}

// Initialize from stored preference
const storedMode = (localStorage.getItem('theme-mode') as ThemeMode) || 'system'
applyTheme(storedMode)

export const useThemeStore = create<ThemeState>((set) => ({
  mode: storedMode,
  setMode: (mode) => {
    applyTheme(mode)
    set({ mode })
  },
}))