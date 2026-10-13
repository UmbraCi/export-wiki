import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { getErrorCode } from '../i18n/backend'
import type {
  AuthStatus,
  ConfluenceUrlTarget,
  ExportOptions,
  ManualAuthConfig,
  PageNode,
  SearchResult,
  SpaceInfo,
  SsoSessionInfo,
  SsoSessionStatus,
} from './contracts'

async function authenticatedInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    if (getErrorCode(error) === 'AUTH_REQUIRED') {
      void emit('auth-required').catch(() => {})
    }
    throw error
  }
}

export const api = {
  startSsoLogin: (baseUrl: string) => invoke<SsoSessionInfo>('start_sso_login', { baseUrl }),
  getSsoSessionStatus: () => invoke<SsoSessionStatus>('get_sso_session_status'),
  navigateSsoWindow: (url: string) => invoke<void>('navigate_sso_window', { url }),
  completeSsoLogin: () => invoke<AuthStatus>('complete_sso_login'),
  cancelSsoLogin: () => invoke<void>('cancel_sso_login'),
  saveManualAuth: (config: ManualAuthConfig) => invoke<AuthStatus>('save_manual_auth', { config }),
  getAuthStatus: () => invoke<AuthStatus>('get_auth_status'),
  logout: () => invoke<AuthStatus>('logout'),
  getSpaces: () => authenticatedInvoke<SpaceInfo[]>('get_spaces'),
  getPageTree: (spaceKey: string) => authenticatedInvoke<PageNode[]>('get_page_tree', { spaceKey }),
  getPageChildren: (pageId: string) => authenticatedInvoke<PageNode[]>('get_page_children', { pageId }),
  getPageDescendants: (pageId: string) => authenticatedInvoke<PageNode[]>('get_page_descendants', { pageId }),
  searchPages: (query: string) => authenticatedInvoke<SearchResult[]>('search_pages', { query }),
  parseConfluenceUrl: (url: string) =>
    invoke<ConfluenceUrlTarget>('parse_confluence_url_command', { url }),
  exportPages: (options: ExportOptions) => authenticatedInvoke<{ exportId: string }>('export_pages', { options }),
  cancelExport: () => invoke<void>('cancel_export'),
}

export type {
  AuthMethod,
  AuthStatus,
  ConfluenceUrlTarget,
  ExportFormat,
  ExportOptions,
  ExportProgressEvent,
  ExportStats,
  ManualAuthConfig,
  PageNode,
  SearchResult,
  SpaceInfo,
  SsoSessionInfo,
  SsoSessionStatus,
} from './contracts'
