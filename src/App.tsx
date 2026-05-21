import Layout from './components/Layout'
import AuthPanel from './components/AuthPanel'
import SpaceSelector from './components/SpaceSelector'
import { useAuthStore } from './stores/authStore'

function App() {
  const { status } = useAuthStore()

  return (
    <Layout>
      {status.authenticated ? <SpaceSelector /> : <AuthPanel />}
    </Layout>
  )
}

export default App