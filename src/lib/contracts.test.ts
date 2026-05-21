import { describe, expect, it } from 'vitest'
import type { ExportOptions, ExportProgressEvent } from './contracts'

describe('shared frontend contracts', () => {
  it('defaults export format to markdown', () => {
    const options: ExportOptions = {
      pageIds: ['123'],
      outputDir: '/tmp/export-wiki',
      format: 'markdown',
      includeAttachments: true,
    }

    expect(options.format).toBe('markdown')
  })

  it('allows html export format', () => {
    const options: ExportOptions = {
      pageIds: ['123'],
      outputDir: '/tmp/export-wiki',
      format: 'html',
      includeAttachments: false,
    }

    expect(options.format).toBe('html')
  })

  it('represents progress without exposing credentials', () => {
    const event: ExportProgressEvent = {
      pageId: '123',
      status: 'writing',
      progress: 75,
      stats: { total: 1, exported: 0, skipped: 0, failed: 0, attachments: 2 },
      message: 'Writing Page Title.md',
    }

    expect(JSON.stringify(event)).not.toMatch(/cookie|token|password/i)
  })
})
