import Layout from './components/Layout'
import AuthForm from './components/AuthForm'
import SpaceSelector from './components/SpaceSelector'
import { useAuthStore } from './stores/authStore'

function App() {
  const { isAuthenticated } = useAuthStore()

  return (
    <Layout>
      {isAuthenticated ? <SpaceSelector /> : <AuthForm />}
    </Layout>
  )
}

export default App