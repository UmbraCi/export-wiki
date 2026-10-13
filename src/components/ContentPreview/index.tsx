import { useTranslation } from 'react-i18next'
import { useSelectionStore } from '../../stores/selectionStore'

function ContentPreview() {
  const { t } = useTranslation('spaces')
  const { selectedPageIds, selectedPageTitles, clearSelection } = useSelectionStore()

  const selectedTitles = selectedPageIds.map(
    (pageId) => selectedPageTitles[pageId] ?? pageId,
  )

  return (
    <details open className="group card-app mt-6 animate-fade-in stagger-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 [&::-webkit-details-marker]:hidden">
        <div>
          <h3 className="font-display text-lg font-semibold text-text-primary">
            {t('selected.title')}
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            {t('selected.count', { count: selectedPageIds.length })}
          </p>
        </div>
        <span className="text-text-muted transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
      </summary>

      <div className="border-t border-border px-6 py-5">
        <div className="flex justify-end">
          {selectedPageIds.length > 0 && (
            <button
              type="button"
              onClick={clearSelection}
              className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              {t('selected.clear')}
            </button>
          )}
        </div>
        {selectedPageIds.length === 0 ? (
          <p className="text-sm text-text-muted">
            {t('selected.empty')}
          </p>
        ) : (
          <ul className="space-y-2 mt-3">
            {selectedTitles.map((title, index) => (
              <li
                key={selectedPageIds[index]}
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-bg-elevated"
              >
                <span className="text-sm font-medium text-text-primary">{title}</span>
                <span className="text-xs text-text-muted ml-auto">{selectedPageIds[index]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}

export default ContentPreview
