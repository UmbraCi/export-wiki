import { lazy, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Layout from './components/Layout'
import { Spinner } from '@/components/ui/spinner'
import { initSsoEventListeners, useAuthStore } from './stores/authStore'
import { useConfigStore } from './stores/configStore'
import { authRequiredViews, useNavStore } from './stores/navStore'
import SpaceBrowserFooter from './components/SpaceBrowser/Footer'
import { useExportStore } from './stores/exportStore'
import { useSelectionStore } from './stores/selectionStore'

const AuthPanel = lazy(() => import('./components/AuthPanel'))
const SpaceBrowser = lazy(() => import('./components/SpaceBrowser'))
const ContentPreview = lazy(() => import('./components/ContentPreview'))
const ExportPanel = lazy(() => import('./components/ExportPanel'))
const ProgressPanel = lazy(() => import('./components/ProgressPanel'))
const SettingsPanel = lazy(() => import('./components/SettingsPanel'))
const LogPanel = lazy(() => import('./components/LogPanel'))

function App() {
  const { t } = useTranslation('common')
  const { status } = useAuthStore()
  const loadConfig = useConfigStore((state) => state.loadConfig)
  const { activeView, setActiveView } = useNavStore()

  useEffect(() => {
    void loadConfig()
    initSsoEventListeners()
    void useAuthStore
      .getState()
      .loadStatus()
      .then(() => {
        if (
          useAuthStore.getState().status.authenticated &&
          useNavStore.getState().activeView === 'authentication'
        ) {
          const pending = useExportStore.getState().resumeOptions
          if (pending) {
            useSelectionStore.setState({ selectedPageIds: pending.pageIds })
            useExportStore.getState().setOptions({
              outputDir: pending.outputDir,
              format: pending.format,
              includeAttachments: pending.includeAttachments,
            })
          }
          setActiveView(pending ? 'export' : 'spaces')
        }
      })
  }, [loadConfig, setActiveView])

  useEffect(() => {
    if (!status.authenticated && authRequiredViews.includes(activeView)) {
      setActiveView('authentication')
    }
  }, [status.authenticated, activeView, setActiveView])

  const renderView = () => {
    if (activeView === 'settings') {
      return <SettingsPanel />
    }
    if (activeView === 'logs') return <LogPanel />

    if (!status.authenticated) {
      return <AuthPanel />
    }

    switch (activeView) {
      case 'authentication':
        return <AuthPanel />
      case 'spaces':
      case 'export':
        return (
          <>
            <div hidden={activeView === 'export'}>
              <SpaceBrowser />
            </div>
            {activeView === 'export' && (
              <>
                <ContentPreview />
                <ExportPanel />
                <ProgressPanel />
              </>
            )}
          </>
        )
      default:
        return <SpaceBrowser />
    }
  }

  return (
    <Layout
      footer={
        status.authenticated && activeView === 'spaces' ? (
          <SpaceBrowserFooter />
        ) : undefined
      }
    >
      <Suspense
        fallback={
          <Spinner className="mx-auto size-6" aria-label={t('loading')} />
        }
      >
        {renderView()}
      </Suspense>
    </Layout>
  )
}

export default App
