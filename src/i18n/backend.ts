import type { TFunction } from 'i18next'

import type { ExportProgressEvent } from '../lib/contracts'
import i18n from './index'

export function formatAuthMethod(
  method: 'sso' | 'api_token' | 'cookie' | null | undefined,
  t: TFunction = i18n.t.bind(i18n),
): string {
  switch (method) {
    case 'sso':
      return t('common:authMethod.sso')
    case 'api_token':
      return t('common:authMethod.apiToken')
    case 'cookie':
      return t('common:authMethod.cookie')
    default:
      return t('common:authMethod.unknown')
  }
}

export function translateBackendError(
  error: { code: string; params?: Record<string, unknown> },
  t: TFunction = i18n.t.bind(i18n),
): string {
  const params = (error.params ?? {}) as Record<string, string | number>
  const translated = t(`errors:${error.code}`, params)
  if (translated !== `errors:${error.code}`) {
    return translated
  }
  return error.code
}

export function translateProgressEvent(
  event: Pick<ExportProgressEvent, 'messageKey' | 'messageParams' | 'message'>,
  t: TFunction = i18n.t.bind(i18n),
): string {
  if (event.messageKey === 'export.queued') {
    const count = Number(event.messageParams?.count ?? 0)
    return t(`export:queued_${count === 1 ? 'one' : 'other'}`, { count })
  }
  if (event.messageKey === 'export.writing') {
    return t('export:writing', event.messageParams ?? {})
  }
  if (event.messageKey === 'export.complete') {
    return t('export:complete', event.messageParams ?? {})
  }
  return event.message ?? ''
}

export function translateInvokeError(
  error: unknown,
  t: TFunction = i18n.t.bind(i18n),
): string {
  const parsed = parseBackendError(error)
  if (parsed) {
    return translateBackendError(parsed, t)
  }

  const message = error instanceof Error ? error.message : String(error)
  return redactSecrets(message)
}

function redactSecrets(message: string): string {
  return message.replace(/token|cookie|password|secret/gi, '[redacted]')
}

export function parseBackendError(error: unknown): { code: string; params?: Record<string, unknown> } | null {
  const message = error instanceof Error ? error.message : String(error)
  try {
    const parsed = JSON.parse(message) as { code?: string; params?: Record<string, unknown> }
    if (parsed && typeof parsed.code === 'string') {
      return parsed
    }
  } catch {
    // not structured backend error
  }
  return null
}

export function getErrorCode(error: unknown): string | null {
  return parseBackendError(error)?.code ?? null
}

export function isInvalidConfluenceUrlError(errorCode: string | null): boolean {
  return errorCode === 'INVALID_CONFLUENCE_URL'
}
