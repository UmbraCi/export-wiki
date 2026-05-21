import { describe, expect, it } from 'vitest'

import {
  formatAuthMethod,
  getErrorCode,
  isInvalidConfluenceUrlError,
  parseBackendError,
  translateBackendError,
  translateProgressEvent,
} from './backend'
import i18n from './index'

describe('i18n backend helpers', () => {
  it('translates known backend error codes in English', async () => {
    await i18n.changeLanguage('en')
    expect(
      translateBackendError({ code: 'AUTH_REQUIRED' }),
    ).toBe('Authentication required')
  })

  it('translates known backend error codes in Chinese', async () => {
    await i18n.changeLanguage('zh-CN')
    expect(
      translateBackendError({ code: 'INVALID_CONFLUENCE_URL' }),
    ).toBe('请输入 Confluence 页面或空间 URL')
  })

  it('parses invoke error payloads', () => {
    const parsed = parseBackendError(new Error(JSON.stringify({ code: 'EMPTY_SELECTION' })))
    expect(parsed?.code).toBe('EMPTY_SELECTION')
    expect(getErrorCode(new Error(JSON.stringify({ code: 'AUTH_REQUIRED' })))).toBe('AUTH_REQUIRED')
  })

  it('detects invalid confluence url error codes', () => {
    expect(isInvalidConfluenceUrlError('INVALID_CONFLUENCE_URL')).toBe(true)
    expect(isInvalidConfluenceUrlError('AUTH_REQUIRED')).toBe(false)
  })

  it('translates export progress keys', async () => {
    await i18n.changeLanguage('en')
    expect(
      translateProgressEvent({
        messageKey: 'export.queued',
        messageParams: { count: 2 },
      }),
    ).toBe('Queued 2 pages for export')

    expect(
      translateProgressEvent({
        messageKey: 'export.writing',
        messageParams: { filename: 'Home.md' },
      }),
    ).toBe('Writing Home.md')
  })

  it('formats auth method labels', async () => {
    await i18n.changeLanguage('zh-CN')
    expect(formatAuthMethod('api_token')).toBe('API 令牌')
  })
})
