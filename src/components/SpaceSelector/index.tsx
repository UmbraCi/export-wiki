import { useSelectionStore } from '../../stores/selectionStore'
import { useEffect, useState } from 'react'

function SpaceSelector() {
  const {
    spaces,
    pages,
    selectedSpaceKeys,
    selectedPageIds,
    isLoadingSpaces,
    isLoadingPages,
    fetchSpaces,
    fetchPages,
    toggleSpaceSelection,
    togglePageSelection,
  } = useSelectionStore()

  const [activeSpaceKey, setActiveSpaceKey] = useState<string | null>(null)

  useEffect(() => { fetchSpaces() }, [fetchSpaces])
  useEffect(() => {
    if (activeSpaceKey) fetchPages(activeSpaceKey)
  }, [activeSpaceKey, fetchPages])

  return (
    <div className="grid grid-cols-2 gap-6 animate-fade-in stagger-3">
      {/* Spaces Panel */}
      <Panel
        title="Spaces"
        subtitle={`${selectedSpaceKeys.length} selected`}
        isLoading={isLoadingSpaces}
        isEmpty={spaces.length === 0}
      >
        {spaces.map((space) => (
          <TreeNode
            key={space.key}
            label={space.name}
            sublabel={space.key}
            selected={selectedSpaceKeys.includes(space.key)}
            onToggle={() => toggleSpaceSelection(space.key)}
            onExpand={() => setActiveSpaceKey(space.key)}
            expanded={activeSpaceKey === space.key}
          />
        ))}
      </Panel>

      {/* Pages Panel */}
      <Panel
        title="Pages"
        subtitle={activeSpaceKey ? `${selectedPageIds.length} selected` : 'Select a space'}
        isLoading={isLoadingPages}
        isEmpty={pages.length === 0}
        inactive={!activeSpaceKey}
      >
        {pages.map((page) => (
          <TreeNode
            key={page.id}
            label={page.title}
            sublabel={page.id}
            selected={selectedPageIds.includes(page.id)}
            onToggle={() => togglePageSelection(page.id)}
            isLeaf
          />
        ))}
      </Panel>
    </div>
  )
}

function Panel({
  title,
  subtitle,
  isLoading,
  isEmpty,
  inactive = false,
  children,
}: {
  title: string
  subtitle: string
  isLoading: boolean
  isEmpty: boolean
  inactive?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`card-app flex flex-col ${inactive ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="px-6 py-5 border-b border-border">
        <h3 className="font-display text-lg font-semibold text-text-primary">{title}</h3>
        <p className="text-sm text-text-secondary mt-1">{subtitle}</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <span className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isEmpty ? (
          <div className="text-center py-12 text-text-muted text-sm">No content</div>
        ) : (
          <div className="space-y-1 px-3">{children}</div>
        )}
      </div>
    </div>
  )
}

function TreeNode({
  label,
  sublabel,
  selected,
  onToggle,
  onExpand,
  expanded,
  isLeaf,
}: {
  label: string
  sublabel?: string
  selected?: boolean
  onToggle?: () => void
  onExpand?: () => void
  expanded?: boolean
  isLeaf?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all duration-150 ${
        selected ? 'bg-accent/10' : 'hover:bg-bg-elevated'
      }`}
    >
      {/* Expand */}
      {!isLeaf && (
        <button onClick={onExpand} className="text-text-muted hover:text-text-primary">
          <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
          selected ? 'bg-accent border-accent' : 'border-border hover:border-text-muted'
        }`}
      >
        {selected && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Labels */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-text-primary truncate">{label}</span>
        {sublabel && <span className="ml-2 text-xs text-text-muted">{sublabel}</span>}
      </div>
    </div>
  )
}

export default SpaceSelector