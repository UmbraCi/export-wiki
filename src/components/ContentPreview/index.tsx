import { useSelectionStore } from '../../stores/selectionStore'

function ContentPreview() {
  const { selectedPageIds, selectedPageTitles, clearSelection } = useSelectionStore()

  const selectedTitles = selectedPageIds.map(
    (pageId) => selectedPageTitles[pageId] ?? pageId,
  )

  return (
    <div className="card-app mt-6 animate-fade-in stagger-4">
      <div className="px-6 py-5 border-b border-border flex items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-text-primary">
            Selected Pages
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            {selectedPageIds.length} page{selectedPageIds.length === 1 ? '' : 's'} selected
          </p>
        </div>

        {selectedPageIds.length > 0 && (
          <button
            type="button"
            onClick={clearSelection}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Clear selection
          </button>
        )}
      </div>

      <div className="px-6 py-5">
        {selectedPageIds.length === 0 ? (
          <p className="text-sm text-text-muted">
            Select pages from the tree to preview your export selection.
          </p>
        ) : (
          <ul className="space-y-2">
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
    </div>
  )
}

export default ContentPreview
