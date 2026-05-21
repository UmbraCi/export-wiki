import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PageNode } from '../../lib/contracts'
import { isInvalidConfluenceUrlError } from '../../i18n/backend'
import { useSelectionStore } from '../../stores/selectionStore'
import Input from '../common/Input'
import Button from '../common/Button'

function SpaceBrowser() {
  const { t } = useTranslation(['spaces', 'common'])
  const {
    spaces,
    pageTrees,
    activeSpaceKey,
    selectedPageIds,
    searchQuery,
    searchResults,
    urlInput,
    isLoadingSpaces,
    isLoadingPages,
    isSearching,
    error,
    errorCode,
    fetchSpaces,
    setActiveSpaceKey,
    togglePageSelection,
    searchPages,
    clearSearchResults,
    selectSearchResult,
    setUrlInput,
    navigateFromUrl,
  } = useSelectionStore()

  const [localSearch, setLocalSearch] = useState(searchQuery)
  const [localUrl, setLocalUrl] = useState(urlInput)

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
  const showSearchResults = searchResults.length > 0 || isSearching

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

      <div className="grid grid-cols-2 gap-6">
        <Panel
          title={t('spaces:spaces.title')}
          subtitle={
            activeSpaceKey
              ? t('spaces:spaces.viewing', { spaceKey: activeSpaceKey })
              : t('spaces:spaces.select')
          }
          isLoading={isLoadingSpaces}
          isEmpty={spaces.length === 0}
          emptyLabel={t('common:empty.noContent')}
          error={showSearchResults ? null : error}
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
              selectedPageIds={selectedPageIds}
              onToggle={togglePageSelection}
            />
          ))}
        </Panel>
      </div>
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
  const { t } = useTranslation('spaces')
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
          aria-label={t('pages.selectAria', { title: node.title })}
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
  emptyLabel,
  children,
}: {
  title: string
  subtitle: string
  isLoading: boolean
  isEmpty: boolean
  inactive?: boolean
  error?: string | null
  emptyLabel: string
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
          <div className="text-center py-12 text-text-muted text-sm">{emptyLabel}</div>
        ) : (
          <div className="space-y-1 px-3">{children}</div>
        )}
      </div>
    </div>
  )
}

export default SpaceBrowser
