import Layout from './components/Layout'
import AuthPanel from './components/AuthPanel'
import SpaceBrowser from './components/SpaceBrowser'
import ContentPreview from './components/ContentPreview'
import ExportPanel from './components/ExportPanel'
import ProgressPanel from './components/ProgressPanel'
import { useAuthStore } from './stores/authStore'

function App() {
  const { status } = useAuthStore()

  return (
    <Layout>
      {status.authenticated ? (
        <>
          <SpaceBrowser />
          <ContentPreview />
          <ExportPanel />
          <ProgressPanel />
        </>
      ) : (
        <AuthPanel />
      )}
    </Layout>
  )
}

export default App
