interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-bg-card rounded-2xl shadow-xl max-w-md w-full mx-4 animate-scale-in">
        {/* Header */}
        {title && (
          <div className="px-6 py-5 border-b border-border">
            <h3 className="font-display text-lg font-semibold text-text-primary">
              {title}
            </h3>
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-5">
          {children}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-bg-secondary text-text-muted hover:bg-bg-elevated hover:text-text-primary transition-colors flex items-center justify-center"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default Modal