import Sidebar from '../Sidebar'
import Header from '../Header'

interface LayoutProps {
  children: React.ReactNode
  footer?: React.ReactNode
}

function Layout({ children, footer }: LayoutProps) {
  return (
    <div className="flex h-screen bg-muted font-sans">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Header />
        <main className="relative flex-1 min-h-0 overflow-auto px-6 py-8">
          {children}
        </main>
        {footer}
      </div>
    </div>
  )
}

export default Layout
