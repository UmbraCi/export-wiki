import Layout from './components/Layout'
import AuthPanel from './components/AuthPanel'
import SpaceBrowser from './components/SpaceBrowser'
import ContentPreview from './components/ContentPreview'
import { useAuthStore } from './stores/authStore'

function App() {
  const { status } = useAuthStore()

  return (
    <Layout>
      {status.authenticated ? (
        <>
          <SpaceBrowser />
          <ContentPreview />
        </>
      ) : (
        <AuthPanel />
      )}
    </Layout>
  )
}

export default App
