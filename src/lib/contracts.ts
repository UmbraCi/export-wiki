export type AuthMethod = 'sso' | 'api_token' | 'cookie'

export interface ManualAuthConfig {
  baseUrl: string
  method: 'api_token' | 'cookie'
  username?: string
  apiToken?: string
  cookie?: string
}

export interface AuthStatus {
  authenticated: boolean
  method: AuthMethod | null
  baseUrl: string | null
  displayName: string | null
}

export interface SsoSessionInfo {
  active: boolean
  entryUrl: string
  baseUrl: string
}

export interface SsoSessionStatus {
  active: boolean
  entryUrl: string | null
  currentUrl: string | null
  wikiSessionDetected: boolean
}

export interface SpaceInfo {
  key: string
  name: string
  type: 'global' | 'personal' | 'archived'
}

export interface PageNode {
  id: string
  title: string
  parentId: string | null
  children: PageNode[]
}

export interface SearchResult {
  pageId: string
  title: string
  spaceKey: string
  excerpt: string
}

export interface ConfluenceUrlTarget {
  pageId: string | null
  spaceKey: string | null
}

export type ExportFormat = 'markdown' | 'html'

export interface ExportOptions {
  pageIds: string[]
  outputDir: string
  format: ExportFormat
  includeAttachments: boolean
}

export interface ExportStats {
  total: number
  exported: number
  skipped: number
  failed: number
  attachments: number
}

export interface ExportProgressEvent {
  pageId: string | null
  status: 'queued' | 'fetching' | 'converting' | 'writing' | 'complete' | 'failed'
  progress: number
  stats: ExportStats
  message: string
}

export interface SyncSettings {
  enabled: boolean
  intervalMinutes: number
  outputDir: string
  pageIds: string[]
}

export const defaultSyncSettings: SyncSettings = {
  enabled: false,
  intervalMinutes: 60,
  outputDir: '',
  pageIds: [],
}
