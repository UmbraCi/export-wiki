import './i18n'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Tauri renders only on the client; next-themes' SSR bootstrap script is unnecessary. */}
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      storageKey="theme-mode"
      enableSystem
      disableTransitionOnChange
      scriptProps={{ type: 'text/plain' }}
    >
      <App />
      <Toaster richColors closeButton />
    </ThemeProvider>
  </React.StrictMode>,
)
