import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PageNode } from '../../lib/contracts'
import { isInvalidConfluenceUrlError } from '../../i18n/backend'
import { useSelectionStore } from '../../stores/selectionStore'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { Card } from '@/components/ui/card'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { Spinner } from '@/components/ui/spinner'
import { ChevronRight } from 'lucide-react'

function SpaceBrowser() {
  const { t } = useTranslation(['spaces', 'common'])
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

  const activePages = activeSpaceKey ? (pageTrees[activeSpaceKey] ?? []) : []
  const filteredSpaces = spaces.filter((space) =>
    `${space.name} ${space.key}`
      .toLocaleLowerCase()
      .includes(spaceSearch.trim().toLocaleLowerCase()),
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
    <div className="space-y-6">
      <Card className="p-6 gap-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Field>
                <FieldLabel htmlFor="page-search">
                  {t('spaces:search.label')}
                </FieldLabel>
                <Input
                  id="page-search"
                  placeholder={t('spaces:search.placeholder')}
                  value={localSearch}
                  onChange={(event) => setLocalSearch(event.target.value)}
                  disabled={isSearching}
                />
              </Field>
            </div>
            <Button
              onClick={() => void searchPages(localSearch)}
              disabled={isSearching || !localSearch.trim()}
            >
              {isSearching
                ? t('common:buttons.searching')
                : t('common:buttons.search')}
            </Button>
            {searchResults.length > 0 && (
              <Button
                variant="ghost"
                type="button"
                onClick={clearSearchResults}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors pb-3"
              >
                {t('common:buttons.clear')}
              </Button>
            )}
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Field data-invalid={isInvalidConfluenceUrlError(errorCode)}>
                <FieldLabel htmlFor="page-url">
                  {t('spaces:url.label')}
                </FieldLabel>
                <Input
                  id="page-url"
                  type="url"
                  placeholder={t('spaces:url.placeholder')}
                  value={localUrl}
                  onChange={(event) => setLocalUrl(event.target.value)}
                  aria-invalid={isInvalidConfluenceUrlError(errorCode)}
                  aria-describedby={
                    isInvalidConfluenceUrlError(errorCode)
                      ? 'page-url-error'
                      : undefined
                  }
                />
                {isInvalidConfluenceUrlError(errorCode) && error && (
                  <FieldError id="page-url-error">{error}</FieldError>
                )}
              </Field>
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
      </Card>

      {showSearchResults && (
        <Card className="gap-0 py-0">
          <div className="px-6 py-5 border-b border-border">
            <h3 className="font-sans text-lg font-semibold text-foreground">
              {t('spaces:results.title')}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {isSearching
                ? t('common:buttons.searching')
                : t('spaces:results.count', { count: searchResults.length })}
            </p>
          </div>

          <div className="py-3">
            {isSearching ? (
              <div className="flex items-center justify-center py-12">
                <Spinner
                  className="size-6"
                  aria-label={t('common:buttons.searching')}
                />
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {t('spaces:results.none')}
              </div>
            ) : (
              <div className="space-y-1 px-3">
                {searchResults.map((result) => {
                  const selected = selectedPageIds.includes(result.pageId)
                  return (
                    <Button
                      variant="ghost"
                      key={result.pageId}
                      type="button"
                      onClick={() => selectSearchResult(result)}
                      className={`h-auto whitespace-normal w-full flex flex-col items-start gap-1 px-4 py-3 rounded-lg text-left transition-all duration-150 ${
                        selected
                          ? 'bg-primary/10 border border-primary/30'
                          : 'hover:bg-accent border border-transparent'
                      }`}
                    >
                      <span className="text-sm font-medium text-foreground">
                        {result.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {result.spaceKey} · {result.pageId}
                      </span>
                      {result.excerpt && (
                        <span className="text-xs text-muted-foreground line-clamp-2">
                          {result.excerpt}
                        </span>
                      )}
                    </Button>
                  )
                })}
              </div>
            )}
          </div>
        </Card>
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
          emptyLabel={
            spaceSearch.trim()
              ? t('spaces:spaces.none')
              : t('common:empty.noContent')
          }
          error={showSearchResults ? null : error}
          toolbar={
            <Field>
              <FieldLabel htmlFor="space-search">
                {t('spaces:spaces.searchLabel')}
              </FieldLabel>
              <Input
                id="space-search"
                placeholder={t('spaces:spaces.searchPlaceholder')}
                value={spaceSearch}
                onChange={(event) => setSpaceSearch(event.target.value)}
              />
            </Field>
          }
        >
          {filteredSpaces.map((space) => (
            <Button
              variant="ghost"
              key={space.key}
              type="button"
              onClick={() => setActiveSpaceKey(space.key)}
              className={`h-auto whitespace-normal w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-150 ${
                activeSpaceKey === space.key
                  ? 'bg-primary/10 border border-primary/30'
                  : 'hover:bg-accent border border-transparent'
              }`}
            >
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground truncate block">
                  {space.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {space.key}
                </span>
              </div>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {space.type}
              </span>
            </Button>
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
              onToggle={(pageId, title, checked) =>
                void togglePageSubtreeSelection(pageId, title, checked)
              }
              expanded={expandedPageIds.includes(page.id)}
              onExpand={togglePageExpanded}
              isLoading={loadingPageIds.includes(page.id)}
              expandedPageIds={expandedPageIds}
              loadingPageIds={loadingPageIds}
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
    : subtreeIds.some((id) => selectedPageIds.has(id))
      ? 'indeterminate'
      : false

  return (
    <div>
      <div
        className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-150 ${
          selected ? 'bg-primary/10' : 'hover:bg-accent'
        }`}
        style={{ paddingLeft: `${depth * 16 + 16}px` }}
      >
        {(node.hasChildren || !node.childrenLoaded) && (
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            onClick={() => onExpand(node.id)}
            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={
              expanded
                ? t('pages.collapseAria', { title: node.title })
                : t('pages.expandAria', { title: node.title })
            }
            aria-expanded={expanded}
          >
            {isLoading ? (
              <Spinner className="size-3" aria-hidden="true" />
            ) : (
              <ChevronRight
                className={`size-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
              />
            )}
          </Button>
        )}
        <Checkbox
          checked={checkboxState}
          onCheckedChange={(checked) =>
            onToggle(node.id, node.title, checked === true)
          }
          disabled={isLoading}
          aria-label={t('pages.selectAria', { title: node.title })}
        />

        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground truncate block">
            {node.title}
          </span>
          <span className="text-xs text-muted-foreground">{node.id}</span>
        </div>
      </div>

      {expanded &&
        node.children.map((child) => (
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

function getSubtreePageIds(
  node: PageNode,
  subtreePageIds: Record<string, string[]>,
): string[] {
  return (
    subtreePageIds[node.id] ?? [
      node.id,
      ...node.children.flatMap((child) =>
        getSubtreePageIds(child, subtreePageIds),
      ),
    ]
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
    <Card className={`gap-0 py-0 ${inactive ? 'opacity-60' : ''}`}>
      <Accordion type="single" collapsible defaultValue="panel">
        <AccordionItem value="panel">
          <AccordionTrigger className="px-6 py-5">
            <span>
              <span className="block text-base font-semibold">{title}</span>
              <span className="mt-1 block text-sm font-normal text-muted-foreground">
                {subtitle}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="border-t pb-0">
            {toolbar && <div className="px-6 pt-4">{toolbar}</div>}
            {error && <p className="px-6 pt-2 text-sm text-red-500">{error}</p>}
            <div className="max-h-[28rem] overflow-y-auto py-3">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner className="size-6" />
                </div>
              ) : isEmpty ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  {emptyLabel}
                </div>
              ) : (
                <div className="space-y-1 px-3">{children}</div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  )
}

export default SpaceBrowser
