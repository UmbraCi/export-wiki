import Sidebar from '../Sidebar'
import Header from '../Header'

interface LayoutProps {
  children: React.ReactNode
}

function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen bg-bg-secondary font-body">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-auto px-8 py-8 animate-fade-in stagger-3">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout