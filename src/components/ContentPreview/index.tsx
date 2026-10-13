import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import {
  createSortedRowModel,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { useSelectionStore } from '@/stores/selectionStore'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
})
type SelectedPage = { id: string; title: string }

function ContentPreview() {
  const { t } = useTranslation('spaces')
  const { selectedPageIds, selectedPageTitles, clearSelection } =
    useSelectionStore()
  const data = useMemo(
    () =>
      selectedPageIds.map((id) => ({
        id,
        title: selectedPageTitles[id] ?? id,
      })),
    [selectedPageIds, selectedPageTitles],
  )
  const columns = useMemo<ColumnDef<typeof features, SelectedPage>[]>(
    () => [
      { accessorKey: 'title', header: t('selected.pageTitle') },
      { accessorKey: 'id', header: t('selected.pageId') },
    ],
    [t],
  )
  const table = useTable({ features, columns, data, getRowId: (row) => row.id })

  return (
    <Card className="mt-6 gap-0 py-0">
      <Accordion type="single" collapsible defaultValue="selection">
        <AccordionItem value="selection">
          <AccordionTrigger className="px-6 py-5">
            <span>
              <span className="block text-base font-semibold">
                {t('selected.title')}
              </span>
              <span className="mt-1 block text-sm font-normal text-muted-foreground">
                {t('selected.count', { count: selectedPageIds.length })}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="border-t px-6 pt-4">
            {data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('selected.empty')}
              </p>
            ) : (
              <>
                <div className="mb-3 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={clearSelection}>
                    {t('selected.clear')}
                  </Button>
                </div>
                <Table aria-label={t('selected.title')}>
                  <TableHeader>
                    {table.getHeaderGroups().map((group) => (
                      <TableRow key={group.id}>
                        {group.headers.map((header) => {
                          const sorted = header.column.getIsSorted()
                          return (
                            <TableHead
                              key={header.id}
                              aria-sort={
                                sorted === 'asc'
                                  ? 'ascending'
                                  : sorted === 'desc'
                                    ? 'descending'
                                    : 'none'
                              }
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={header.column.getToggleSortingHandler()}
                              >
                                <table.FlexRender header={header} />
                                {sorted === 'asc' ? (
                                  <ArrowUp />
                                ) : sorted === 'desc' ? (
                                  <ArrowDown />
                                ) : (
                                  <ArrowUpDown />
                                )}
                              </Button>
                            </TableHead>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getAllCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            className="max-w-sm whitespace-normal break-words"
                          >
                            <table.FlexRender cell={cell} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  )
}

export default ContentPreview
