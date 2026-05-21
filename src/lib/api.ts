/**
 * Contract types aligned with Rust/Tauri payloads. Demo invoke wrappers removed in Task 2.
 */
export type {
  AuthMethod as ContractAuthMethod,
  AuthStatus as ContractAuthStatus,
  ExportOptions as MarkdownExportOptions,
  ExportProgressEvent,
  ExportStats,
  ManualAuthConfig,
  PageNode as ContractPageNode,
  SpaceInfo as ContractSpaceInfo,
} from './contracts'

import { invoke } from '@tauri-apps/api/core'

export interface AuthConfig {
  base_url: string
  username: string
  api_token: string
}

export interface Space {
  key: string
  name: string
}

export interface Page {
  id: string
  title: string
}

export interface ExportOptions {
  space_key: string
  output_path: string
}

export interface Config {
  auth?: {
    base_url: string
    username: string
  }
  export_path?: string
}

export const api = {
  authConfigure: (config: AuthConfig) => invoke<{ success: boolean }>('auth_configure', { config }),
  authTest: () => invoke<{ success: boolean; message: string }>('auth_test'),
  getSpaces: () => invoke<Space[]>('get_spaces'),
  getPages: (spaceKey: string) => invoke<Page[]>('get_pages', { spaceKey }),
  startExport: (options: ExportOptions) => invoke<{ success: boolean }>('start_export', { options }),
  saveConfig: (config: Config) => invoke<{ success: boolean }>('save_config', { config }),
  loadConfig: () => invoke<Config | null>('load_config'),
}
