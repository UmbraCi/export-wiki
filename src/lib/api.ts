import { invoke } from '@tauri-apps/api/core'
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

export const api = {
  startSsoLogin: (baseUrl: string) => invoke<SsoSessionInfo>('start_sso_login', { baseUrl }),
  getSsoSessionStatus: () => invoke<SsoSessionStatus>('get_sso_session_status'),
  navigateSsoWindow: (url: string) => invoke<void>('navigate_sso_window', { url }),
  completeSsoLogin: () => invoke<AuthStatus>('complete_sso_login'),
  cancelSsoLogin: () => invoke<void>('cancel_sso_login'),
  saveManualAuth: (config: ManualAuthConfig) => invoke<AuthStatus>('save_manual_auth', { config }),
  getAuthStatus: () => invoke<AuthStatus>('get_auth_status'),
  logout: () => invoke<AuthStatus>('logout'),
  getSpaces: () => invoke<SpaceInfo[]>('get_spaces'),
  getPageTree: (spaceKey: string) => invoke<PageNode[]>('get_page_tree', { spaceKey }),
  searchPages: (query: string) => invoke<SearchResult[]>('search_pages', { query }),
  parseConfluenceUrl: (url: string) =>
    invoke<ConfluenceUrlTarget>('parse_confluence_url_command', { url }),
  exportPages: (options: ExportOptions) => invoke<{ exportId: string }>('export_pages', { options }),
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
