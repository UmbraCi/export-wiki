import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PageNode } from '../../lib/contracts'
import { isInvalidConfluenceUrlError } from '../../i18n/backend'
import { useSelectionStore } from '../../stores/selectionStore'
import { useNavStore } from '../../stores/navStore'
import { Checkbox } from '@/components/ui/checkbox'
import Input from '../common/Input'
import Button from '../common/Button'

function SpaceBrowser() {
  const { t } = useTranslation(['spaces', 'common'])
  const setActiveView = useNavStore((state) => state.setActiveView)
  const {
    spaces,
    pageTrees,
    activeSpaceKey,
    selectedPageIds,
    selectedSubtreePageIds,
    searchQuery,
    searchResults,
    urlInput,
    isLoadingSpaces,
    isLoadingPages,
    loadingPageIds,
    isSearching,
    error,
    errorCode,
    fetchSpaces,
    setActiveSpaceKey,
    fetchPageChildren,
    togglePageSubtreeSelection,
    searchPages,
    clearSearchResults,
    selectSearchResult,
    setUrlInput,
    navigateFromUrl,
  } = useSelectionStore()

  const [localSearch, setLocalSearch] = useState(searchQuery)
  const [localUrl, setLocalUrl] = useState(urlInput)
  const [spaceSearch, setSpaceSearch] = useState('')
  const [expandedPageIds, setExpandedPageIds] = useState<string[]>([])
  const selectedIds = useMemo(() => new Set(selectedPageIds), [selectedPageIds])

  useEffect(() => {
    void fetchSpaces()
  }, [fetchSpaces])

  useEffect(() => {
    setLocalSearch(searchQuery)
  }, [searchQuery])

  useEffect(() => {
    setLocalUrl(urlInput)
  }, [urlInput])

  const activePages = activeSpaceKey ? pageTrees[activeSpaceKey] ?? [] : []
  const filteredSpaces = spaces.filter((space) =>
    `${space.name} ${space.key}`.toLocaleLowerCase().includes(spaceSearch.trim().toLocaleLowerCase()),
  )
  const showSearchResults = searchResults.length > 0 || isSearching

  const togglePageExpanded = (pageId: string) => {
    if (expandedPageIds.includes(pageId)) {
      setExpandedPageIds((ids) => ids.filter((id) => id !== pageId))
      return
    }

    setExpandedPageIds((ids) => [...ids, pageId])
    const findPage = (nodes: PageNode[]): PageNode | undefined => {
      for (const node of nodes) {
        if (node.id === pageId) return node
        const found = findPage(node.children)
        if (found) return found
      }
      return undefined
    }
    const page = findPage(activePages)
    if (page && !page.childrenLoaded) void fetchPageChildren(pageId)
  }

  return (
    <div className="space-y-6 animate-fade-in stagger-3">
      <div className="card-app p-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label={t('spaces:search.label')}
                placeholder={t('spaces:search.placeholder')}
                value={localSearch}
                onChange={setLocalSearch}
                disabled={isSearching}
              />
            </div>
            <Button
              variant="primary"
              onClick={() => void searchPages(localSearch)}
              disabled={isSearching || !localSearch.trim()}
            >
              {isSearching ? t('common:buttons.searching') : t('common:buttons.search')}
            </Button>
            {searchResults.length > 0 && (
              <button
                type="button"
                onClick={clearSearchResults}
                className="text-sm text-text-secondary hover:text-text-primary transition-colors pb-3"
              >
                {t('common:buttons.clear')}
              </button>
            )}
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label={t('spaces:url.label')}
                type="url"
                placeholder={t('spaces:url.placeholder')}
                value={localUrl}
                onChange={setLocalUrl}
                error={isInvalidConfluenceUrlError(errorCode) ? error ?? undefined : undefined}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setUrlInput(localUrl)
                void navigateFromUrl(localUrl)
              }}
              disabled={!localUrl.trim()}
            >
              {t('common:buttons.go')}
            </Button>
          </div>
        </div>

        {error && !isInvalidConfluenceUrlError(errorCode) && (
          <p className="text-sm text-red-500">{error}</p>
        )}
      </div>

      {showSearchResults && (
        <div className="card-app">
          <div className="px-6 py-5 border-b border-border">
            <h3 className="font-display text-lg font-semibold text-text-primary">{t('spaces:results.title')}</h3>
            <p className="text-sm text-text-secondary mt-1">
              {isSearching
                ? t('common:buttons.searching')
                : t('spaces:results.count', { count: searchResults.length })}
            </p>
          </div>

          <div className="py-3">
            {isSearching ? (
              <div className="flex items-center justify-center py-12">
                <span className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-12 text-text-muted text-sm">{t('spaces:results.none')}</div>
            ) : (
              <div className="space-y-1 px-3">
                {searchResults.map((result) => {
                  const selected = selectedPageIds.includes(result.pageId)
                  return (
                    <button
                      key={result.pageId}
                      type="button"
                      onClick={() => selectSearchResult(result)}
                      className={`w-full flex flex-col items-start gap-1 px-4 py-3 rounded-lg text-left transition-all duration-150 ${
                        selected ? 'bg-accent/10 border border-accent/30' : 'hover:bg-bg-elevated border border-transparent'
                      }`}
                    >
                      <span className="text-sm font-medium text-text-primary">{result.title}</span>
                      <span className="text-xs text-text-muted">
                        {result.spaceKey} · {result.pageId}
                      </span>
                      {result.excerpt && (
                        <span className="text-xs text-text-secondary line-clamp-2">{result.excerpt}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel
          title={t('spaces:spaces.title')}
          subtitle={
            activeSpaceKey
              ? t('spaces:spaces.viewing', { spaceKey: activeSpaceKey })
              : t('spaces:spaces.select')
          }
          isLoading={isLoadingSpaces}
          isEmpty={spaces.length === 0 || filteredSpaces.length === 0}
          emptyLabel={spaceSearch.trim() ? t('spaces:spaces.none') : t('common:empty.noContent')}
          error={showSearchResults ? null : error}
          toolbar={
            <Input
              label={t('spaces:spaces.searchLabel')}
              placeholder={t('spaces:spaces.searchPlaceholder')}
              value={spaceSearch}
              onChange={setSpaceSearch}
            />
          }
        >
          {filteredSpaces.map((space) => (
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
          title={t('spaces:pages.title')}
          subtitle={
            activeSpaceKey
              ? t('spaces:pages.selectedInSpace', {
                  count: selectedPageIds.length,
                  spaceKey: activeSpaceKey,
                })
              : t('spaces:pages.selectSpace')
          }
          isLoading={isLoadingPages}
          isEmpty={activeSpaceKey !== null && activePages.length === 0}
          inactive={!activeSpaceKey}
          emptyLabel={t('common:empty.noContent')}
          error={activeSpaceKey && !showSearchResults ? error : null}
        >
          {activePages.map((page) => (
            <PageTreeNode
              key={page.id}
              node={page}
              depth={0}
              selectedPageIds={selectedIds}
              subtreePageIds={selectedSubtreePageIds}
              onToggle={(pageId, title, checked) => void togglePageSubtreeSelection(pageId, title, checked)}
              expanded={expandedPageIds.includes(page.id)}
              onExpand={togglePageExpanded}
              isLoading={loadingPageIds.includes(page.id)}
              expandedPageIds={expandedPageIds}
              loadingPageIds={loadingPageIds}
            />
          ))}
        </Panel>
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-4 border-t border-border bg-bg-secondary py-4">
        <p className="text-sm text-text-secondary" role="status">
          {t('spaces:selected.count', { count: selectedPageIds.length })}
        </p>
        <Button
          onClick={() => setActiveView('export')}
          disabled={selectedPageIds.length === 0 || loadingPageIds.length > 0}
        >
          {t('common:buttons.next')}
        </Button>
      </div>
    </div>
  )
}

function PageTreeNode({
  node,
  depth,
  selectedPageIds,
  subtreePageIds,
  onToggle,
  expanded,
  onExpand,
  isLoading,
  expandedPageIds,
  loadingPageIds,
}: {
  node: PageNode
  depth: number
  selectedPageIds: Set<string>
  subtreePageIds: Record<string, string[]>
  onToggle: (pageId: string, title: string, checked: boolean) => void
  expanded: boolean
  onExpand: (pageId: string) => void
  isLoading: boolean
  expandedPageIds: string[]
  loadingPageIds: string[]
}) {
  const { t } = useTranslation('spaces')
  const selected = selectedPageIds.has(node.id)
  const subtreeIds = getSubtreePageIds(node, subtreePageIds)
  const checkboxState = subtreeIds.every((id) => selectedPageIds.has(id))
    ? true
    : subtreeIds.some((id) => selectedPageIds.has(id)) ? 'indeterminate' : false

  return (
    <div>
      <div
        className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-150 ${
          selected ? 'bg-accent/10' : 'hover:bg-bg-elevated'
        }`}
        style={{ paddingLeft: `${depth * 16 + 16}px` }}
      >
        {(node.hasChildren || !node.childrenLoaded) && (
          <button
            type="button"
            onClick={() => onExpand(node.id)}
            className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-text-primary"
            aria-label={expanded ? t('pages.collapseAria', { title: node.title }) : t('pages.expandAria', { title: node.title })}
          >
            {isLoading ? (
              <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className={`text-lg leading-none transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
            )}
          </button>
        )}
        <Checkbox
          checked={checkboxState}
          onCheckedChange={(checked) => onToggle(node.id, node.title, checked === true)}
          disabled={isLoading}
          aria-label={t('pages.selectAria', { title: node.title })}
        />

        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-text-primary truncate block">{node.title}</span>
          <span className="text-xs text-text-muted">{node.id}</span>
        </div>
      </div>

      {expanded && node.children.map((child) => (
        <PageTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedPageIds={selectedPageIds}
          subtreePageIds={subtreePageIds}
          onToggle={onToggle}
          expanded={expandedPageIds.includes(child.id)}
          onExpand={onExpand}
          isLoading={loadingPageIds.includes(child.id)}
          expandedPageIds={expandedPageIds}
          loadingPageIds={loadingPageIds}
        />
      ))}
    </div>
  )
}

function getSubtreePageIds(node: PageNode, subtreePageIds: Record<string, string[]>): string[] {
  return subtreePageIds[node.id] ?? [node.id, ...node.children.flatMap((child) => getSubtreePageIds(child, subtreePageIds))]
}

function Panel({
  title,
  subtitle,
  isLoading,
  isEmpty,
  inactive = false,
  error,
  emptyLabel,
  toolbar,
  children,
}: {
  title: string
  subtitle: string
  isLoading: boolean
  isEmpty: boolean
  inactive?: boolean
  error?: string | null
  emptyLabel: string
  toolbar?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <details open className={`group card-app flex flex-col ${inactive ? 'opacity-60' : ''}`}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-6 py-5 [&::-webkit-details-marker]:hidden">
        <div>
          <h3 className="font-display text-lg font-semibold text-text-primary">{title}</h3>
          <p className="text-sm text-text-secondary mt-1">{subtitle}</p>
        </div>
        <span className="text-text-muted transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
      </summary>

      <div className="border-t border-border">
        {toolbar && <div className="px-6 pt-4">{toolbar}</div>}
        {error && <p className="px-6 pt-2 text-sm text-red-500">{error}</p>}
        <div className="max-h-[28rem] overflow-y-auto py-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isEmpty ? (
            <div className="text-center py-12 text-text-muted text-sm">{emptyLabel}</div>
          ) : (
            <div className="space-y-1 px-3">{children}</div>
          )}
        </div>
      </div>
    </details>
  )
}

export default SpaceBrowser
