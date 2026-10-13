import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useNavStore } from '@/stores/navStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

function Header() {
  const { t } = useTranslation('common')
  const { theme, setTheme } = useTheme()
  const { activeView, setActiveView } = useNavStore()

  return (
    <header className="border-b bg-card px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          {activeView === 'export' ? (
            <Breadcrumb aria-label={t('nav.breadcrumb')}>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <Button
                    variant="link"
                    className="px-0"
                    onClick={() => setActiveView('spaces')}
                  >
                    {t('buttons.backToSpaces')}
                  </Button>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    <h1 className="text-xl font-semibold">{t('nav.export')}</h1>
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          ) : (
            <h1 className="text-xl font-semibold">{t('app.title')}</h1>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {t('app.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ToggleGroup
            type="single"
            variant="outline"
            value={theme ?? 'system'}
            onValueChange={(value) => {
              if (value) setTheme(value)
            }}
            aria-label={t('theme.label')}
          >
            <ToggleGroupItem
              value="light"
              aria-label={t('theme.light')}
              title={t('theme.light')}
            >
              <Sun />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="system"
              aria-label={t('theme.system')}
              title={t('theme.system')}
            >
              <Monitor />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="dark"
              aria-label={t('theme.dark')}
              title={t('theme.dark')}
            >
              <Moon />
            </ToggleGroupItem>
          </ToggleGroup>
          <Badge variant="secondary">
            <span className="size-2 rounded-full bg-emerald-500" />
            {t('status.ready')}
          </Badge>
        </div>
      </div>
    </header>
  )
}

export default Header
