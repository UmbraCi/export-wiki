import { useEffect } from 'react'
import Layout from './components/Layout'
import AuthPanel from './components/AuthPanel'
import SpaceBrowser from './components/SpaceBrowser'
import ContentPreview from './components/ContentPreview'
import ExportPanel from './components/ExportPanel'
import ProgressPanel from './components/ProgressPanel'
import SettingsPanel from './components/SettingsPanel'
import { useAuthStore } from './stores/authStore'
import { authRequiredViews, useNavStore } from './stores/navStore'

function App() {
  const { status } = useAuthStore()
  const { activeView, setActiveView } = useNavStore()

  useEffect(() => {
    if (!status.authenticated && authRequiredViews.includes(activeView)) {
      setActiveView('authentication')
    }
  }, [status.authenticated, activeView, setActiveView])

  const renderView = () => {
    if (!status.authenticated) {
      return <AuthPanel />
    }

    switch (activeView) {
      case 'authentication':
        return <AuthPanel />
      case 'spaces':
        return <SpaceBrowser />
      case 'pages':
        return (
          <>
            <ContentPreview />
            <ExportPanel />
            <ProgressPanel />
          </>
        )
      case 'settings':
        return <SettingsPanel />
      default:
        return <SpaceBrowser />
    }
  }

  return <Layout>{renderView()}</Layout>
}

export default App
