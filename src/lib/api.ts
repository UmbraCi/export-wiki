import { invoke } from '@tauri-apps/api/core'
import type { AuthStatus, ExportOptions, ManualAuthConfig, PageNode, SpaceInfo } from './contracts'

export const api = {
  startSsoLogin: (baseUrl: string) => invoke<AuthStatus>('start_sso_login', { baseUrl }),
  saveManualAuth: (config: ManualAuthConfig) => invoke<AuthStatus>('save_manual_auth', { config }),
  getAuthStatus: () => invoke<AuthStatus>('get_auth_status'),
  logout: () => invoke<AuthStatus>('logout'),
  getSpaces: () => invoke<SpaceInfo[]>('get_spaces'),
  getPageTree: (spaceKey: string) => invoke<PageNode[]>('get_page_tree', { spaceKey }),
  exportPages: (options: ExportOptions) => invoke<{ exportId: string }>('export_pages', { options }),
}

export type {
  AuthMethod,
  AuthStatus,
  ExportOptions,
  ExportProgressEvent,
  ExportStats,
  ManualAuthConfig,
  PageNode,
  SpaceInfo,
} from './contracts'
