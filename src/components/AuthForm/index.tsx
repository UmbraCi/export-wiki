import { useAuthStore, AuthMethod } from '../../stores/authStore'
import Button from '../common/Button'
import Input from '../common/Input'
import Toast from '../common/Toast'
import { useState, useEffect } from 'react'

function AuthForm() {
  const { authMethod, setAuthMethod, testConnection, isTesting, isAuthenticated, error, clearError, setCredentials } = useAuthStore()
  const [url, setUrl] = useState('')
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info')

  useEffect(() => {
    if (error) {
      setToastMessage(error)
      setToastType('error')
      setShowToast(true)
    }
  }, [error])

  const handleTestConnection = async () => {
    const success = await testConnection()
    if (success) {
      setToastMessage('Connection successful')
      setToastType('success')
      setShowToast(true)
    }
  }

  return (
    <div className="max-w-xl mx-auto animate-fade-in stagger-2">
      {/* Card */}
      <div className="card-app">
        {/* Header */}
        <div className="px-8 py-6 border-b border-border">
          <h2 className="font-display text-xl font-semibold text-text-primary tracking-tight">
            Authentication
          </h2>
          <p className="text-sm text-text-secondary mt-2">
            Connect to your Confluence instance
          </p>
        </div>

        {/* Method Tabs */}
        <div className="px-8 pt-6">
          <AuthMethodTabs activeMethod={authMethod} onChange={setAuthMethod} />
        </div>

        {/* Form */}
        <div className="p-8 space-y-5">
          <Input
            label="Confluence URL"
            placeholder="https://your-company.atlassian.net"
            type="url"
            value={url}
            onChange={(val) => {
              setUrl(val)
              const state = useAuthStore.getState()
              setCredentials({ ...state.credentials!, url: val })
            }}
          />

          {authMethod === 'api_token' && <ApiTokenFields url={url} />}
          {authMethod === 'cookie' && <CookieFields url={url} />}
          {authMethod === 'password' && <PasswordFields url={url} />}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-bg-secondary border-t border-border flex justify-between items-center">
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <span className="w-2 h-2 rounded-full bg-success" />
                <span className="text-sm text-success font-medium">Connected</span>
              </>
            ) : (
              <span className="text-sm text-text-muted">Not connected</span>
            )}
          </div>
          <Button
            onClick={handleTestConnection}
            loading={isTesting}
            disabled={!url}
          >
            Test Connection
          </Button>
        </div>
      </div>

      {/* Toast */}
      {showToast && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={() => {
            setShowToast(false)
            clearError()
          }}
        />
      )}
    </div>
  )
}

function AuthMethodTabs({ activeMethod, onChange }: { activeMethod: AuthMethod; onChange: (method: AuthMethod) => void }) {
  const methods: { key: AuthMethod; label: string }[] = [
    { key: 'api_token', label: 'API Token' },
    { key: 'cookie', label: 'Session Cookie' },
    { key: 'password', label: 'Password' },
  ]

  return (
    <div className="flex gap-2">
      {methods.map((method) => (
        <button
          key={method.key}
          onClick={() => onChange(method.key)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeMethod === method.key
              ? 'bg-accent text-white'
              : 'bg-bg-secondary text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
          }`}
        >
          {method.label}
        </button>
      ))}
    </div>
  )
}

function ApiTokenFields({ url }: { url: string }) {
  const { setCredentials } = useAuthStore()
  const [username, setUsername] = useState('')
  const [apiToken, setApiToken] = useState('')

  useEffect(() => {
    setCredentials({ url, method: 'api_token', username, apiToken })
  }, [url, username, apiToken, setCredentials])

  return (
    <div className="space-y-5 animate-fade-in stagger-3">
      <Input label="Email / Username" placeholder="your-email@company.com" value={username} onChange={setUsername} />
      <Input label="API Token" placeholder="Get from Atlassian Account Settings" type="password" value={apiToken} onChange={setApiToken} />
      <p className="text-xs text-text-muted">
        Generate API token at Atlassian Account → Security → API tokens
      </p>
    </div>
  )
}

function CookieFields({ url }: { url: string }) {
  const { setCredentials } = useAuthStore()
  const [cookies, setCookies] = useState('')

  useEffect(() => {
    setCredentials({ url, method: 'cookie', cookies })
  }, [url, cookies, setCredentials])

  return (
    <div className="space-y-5 animate-fade-in stagger-3">
      <Input label="Session Cookies" placeholder="cookie1=value1; cookie2=value2" value={cookies} onChange={setCookies} />
      <p className="text-xs text-text-muted">
        Copy cookies from browser DevTools → Application → Cookies after SSO login
      </p>
    </div>
  )
}

function PasswordFields({ url }: { url: string }) {
  const { setCredentials } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    setCredentials({ url, method: 'password', username, password })
  }, [url, username, password, setCredentials])

  return (
    <div className="space-y-5 animate-fade-in stagger-3">
      <Input label="Username" placeholder="your-username" value={username} onChange={setUsername} />
      <Input label="Password" placeholder="Your Confluence password" type="password" value={password} onChange={setPassword} />
      <p className="text-xs text-[var(--color-app-orange)] dark:text-[var(--color-dark-orange)]">
        For Confluence Server/Data Center only. Not recommended for Cloud.
      </p>
    </div>
  )
}

export default AuthForm