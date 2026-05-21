interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  onClose?: () => void
}

function Toast({ message, type = 'info', onClose }: ToastProps) {
  const typeStyles = {
    success: 'bg-success',
    error: 'bg-error',
    info: 'bg-bg-card text-text-primary',
  }

  return (
    <div
      className={`fixed bottom-8 right-8 ${typeStyles[type]} text-white px-5 py-3 rounded-xl shadow-lg font-medium text-sm flex items-center gap-3 animate-fade-in`}
    >
      <span>{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          className="opacity-70 hover:opacity-100 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

export default Toast