import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { open } from '@tauri-apps/plugin-dialog'
import { Download, FolderOpen } from 'lucide-react'
import { useExportStore } from '@/stores/exportStore'
import { useSelectionStore } from '@/stores/selectionStore'
import { exportFormSchema } from '@/lib/formSchemas'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldLabel,
  FieldContent,
  FieldDescription,
  FieldError,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from '@/components/ui/input-group'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'

function ExportPanel() {
  const { t } = useTranslation(['export', 'common'])
  const { options, setOptions, startExport, isExporting, error } =
    useExportStore()
  const selectedPageIds = useSelectionStore((state) => state.selectedPageIds)
  const form = useForm<z.infer<typeof exportFormSchema>>({
    resolver: zodResolver(exportFormSchema),
    values: options,
  })
  const outputDir = form.watch('outputDir')
  const canExport =
    selectedPageIds.length > 0 && outputDir.trim().length > 0 && !isExporting

  const submit = form.handleSubmit(async (values) => {
    if (!selectedPageIds.length || isExporting) return
    setOptions(values)
    await startExport(selectedPageIds)
  })

  return (
    <form onSubmit={submit} noValidate>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>
            <h3>{t('export:panel.title')}</h3>
          </CardTitle>
          <CardDescription>{t('export:panel.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset disabled={isExporting} className="space-y-6">
            <Field data-invalid={!!form.formState.errors.outputDir}>
              <FieldLabel htmlFor="export-output">
                {t('export:fields.outputDir')}
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="export-output"
                  placeholder={t('export:fields.outputDirPlaceholder')}
                  {...form.register('outputDir')}
                  aria-invalid={!!form.formState.errors.outputDir}
                  aria-describedby={
                    form.formState.errors.outputDir
                      ? 'export-output-error'
                      : undefined
                  }
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label={t('export:fields.pickDir')}
                    onClick={async () => {
                      const selected = await open({ directory: true })
                      if (selected)
                        form.setValue('outputDir', selected, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                    }}
                  >
                    <FolderOpen />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              {form.formState.errors.outputDir && (
                <FieldError id="export-output-error">
                  {t('common:validation.required')}
                </FieldError>
              )}
            </Field>
            <Controller
              control={form.control}
              name="includeAttachments"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Switch
                    id="export-attachments"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    aria-describedby="export-attachments-description"
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="export-attachments">
                      {t('export:attachments.label')}
                    </FieldLabel>
                    <FieldDescription id="export-attachments-description">
                      {t('export:attachments.description')}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="format"
              render={({ field }) => (
                <Field>
                  <FieldLabel id="export-format-label">
                    {t('export:format.label')}
                  </FieldLabel>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    aria-labelledby="export-format-label"
                  >
                    {(['markdown', 'html', 'migration_package'] as const).map(
                      (value) => (
                        <Field
                          key={value}
                          orientation="horizontal"
                          className="rounded-lg border p-3"
                        >
                          <RadioGroupItem
                            id={`format-${value}`}
                            value={value}
                          />
                          <FieldLabel htmlFor={`format-${value}`}>
                            {t(`export:format.${value}`)}
                          </FieldLabel>
                        </Field>
                      ),
                    )}
                  </RadioGroup>
                </Field>
              )}
            />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </fieldset>
        </CardContent>
        <CardFooter className="justify-end border-t">
          <Button type="submit" disabled={!canExport} aria-busy={isExporting}>
            {isExporting ? <Spinner aria-hidden="true" /> : <Download />}
            {t('export:button.export', { count: selectedPageIds.length })}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

export default ExportPanel
