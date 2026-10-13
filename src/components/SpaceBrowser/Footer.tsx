import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useSelectionStore } from '@/stores/selectionStore'
import { useNavStore } from '@/stores/navStore'

export default function SpaceBrowserFooter() {
  const { t } = useTranslation(['spaces', 'common'])
  const selectedPageIds = useSelectionStore((s) => s.selectedPageIds)
  const loadingPageIds = useSelectionStore((s) => s.loadingPageIds)
  const setActiveView = useNavStore((s) => s.setActiveView)
  return (
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-t border-border bg-muted px-6 py-4">
      <p className="text-sm text-muted-foreground" role="status">
        {t('spaces:selected.count', { count: selectedPageIds.length })}
      </p>
      <Button
        onClick={() => setActiveView('export')}
        disabled={selectedPageIds.length === 0 || loadingPageIds.length > 0}
      >
        {t('common:buttons.next')}
      </Button>
    </footer>
  )
}
