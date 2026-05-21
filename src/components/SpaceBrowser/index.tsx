import { useEffect } from 'react'
import type { PageNode } from '../../lib/contracts'
import { useSelectionStore } from '../../stores/selectionStore'

function SpaceBrowser() {
  const {
    spaces,
    pageTrees,
    activeSpaceKey,
    selectedPageIds,
    isLoadingSpaces,
    isLoadingPages,
    error,
    fetchSpaces,
    setActiveSpaceKey,
    togglePageSelection,
  } = useSelectionStore()

  useEffect(() => {
    void fetchSpaces()
  }, [fetchSpaces])

  const activePages = activeSpaceKey ? pageTrees[activeSpaceKey] ?? [] : []

  return (
    <div className="grid grid-cols-2 gap-6 animate-fade-in stagger-3">
      <Panel
        title="Spaces"
        subtitle={activeSpaceKey ? `Viewing ${activeSpaceKey}` : 'Select a space'}
        isLoading={isLoadingSpaces}
        isEmpty={spaces.length === 0}
        error={error}
      >
        {spaces.map((space) => (
          <button
            key={space.key}
            type="button"
            onClick={() => setActiveSpaceKey(space.key)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-150 ${
              activeSpaceKey === space.key
                ? 'bg-accent/10 border border-accent/30'
                : 'hover:bg-bg-elevated border border-transparent'
            }`}
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-text-primary truncate block">
                {space.name}
              </span>
              <span className="text-xs text-text-muted">{space.key}</span>
            </div>
            <span className="text-xs uppercase tracking-wide text-text-muted">{space.type}</span>
          </button>
        ))}
      </Panel>

      <Panel
        title="Pages"
        subtitle={
          activeSpaceKey
            ? `${selectedPageIds.length} selected in ${activeSpaceKey}`
            : 'Select a space to browse pages'
        }
        isLoading={isLoadingPages}
        isEmpty={activeSpaceKey !== null && activePages.length === 0}
        inactive={!activeSpaceKey}
        error={activeSpaceKey ? error : null}
      >
        {activePages.map((page) => (
          <PageTreeNode
            key={page.id}
            node={page}
            depth={0}
            selectedPageIds={selectedPageIds}
            onToggle={togglePageSelection}
          />
        ))}
      </Panel>
    </div>
  )
}

function PageTreeNode({
  node,
  depth,
  selectedPageIds,
  onToggle,
}: {
  node: PageNode
  depth: number
  selectedPageIds: string[]
  onToggle: (pageId: string, title: string) => void
}) {
  const selected = selectedPageIds.includes(node.id)

  return (
    <div>
      <div
        className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-150 ${
          selected ? 'bg-accent/10' : 'hover:bg-bg-elevated'
        }`}
        style={{ paddingLeft: `${depth * 16 + 16}px` }}
      >
        <button
          type="button"
          onClick={() => onToggle(node.id, node.title)}
          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
            selected ? 'bg-accent border-accent' : 'border-border hover:border-text-muted'
          }`}
          aria-label={`Select ${node.title}`}
        >
          {selected && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-text-primary truncate block">{node.title}</span>
          <span className="text-xs text-text-muted">{node.id}</span>
        </div>
      </div>

      {node.children.map((child) => (
        <PageTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedPageIds={selectedPageIds}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

function Panel({
  title,
  subtitle,
  isLoading,
  isEmpty,
  inactive = false,
  error,
  children,
}: {
  title: string
  subtitle: string
  isLoading: boolean
  isEmpty: boolean
  inactive?: boolean
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <div className={`card-app flex flex-col min-h-[28rem] ${inactive ? 'opacity-60' : ''}`}>
      <div className="px-6 py-5 border-b border-border">
        <h3 className="font-display text-lg font-semibold text-text-primary">{title}</h3>
        <p className="text-sm text-text-secondary mt-1">{subtitle}</p>
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
      </div>

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

export default SpaceBrowser
