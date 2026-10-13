import { z } from 'zod'

const required = z
  .string()
  .refine((value) => value.trim().length > 0, 'validation.required')

export const wikiUrlSchema = z.url({
  protocol: /^https$/,
  error: 'validation.httpsUrl',
})

export const manualAuthSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('api_token'),
    baseUrl: wikiUrlSchema,
    username: required,
    apiToken: required,
  }),
  z.object({
    method: z.literal('cookie'),
    baseUrl: wikiUrlSchema,
    cookie: required,
  }),
])

export const exportFormSchema = z.object({
  outputDir: required,
  format: z.enum(['markdown', 'html', 'migration_package']),
  includeAttachments: z.boolean(),
})

export const syncFormSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z
    .number()
    .int('validation.positiveInteger')
    .min(1, 'validation.positiveInteger'),
  outputDir: z.string(),
})

export const settingsFormSchema = z.object({
  locale: z.enum(['en', 'zh-CN']),
  defaultOutputDir: z.string(),
  defaultFormat: z.enum(['markdown', 'html']),
  includeAttachmentsDefault: z.boolean(),
  skipUnchangedDefault: z.boolean(),
  sync: syncFormSchema,
})
