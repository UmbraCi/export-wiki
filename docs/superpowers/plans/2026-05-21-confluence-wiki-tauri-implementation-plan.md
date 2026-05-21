# Confluence Wiki Tauri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `export-wiki` as a Tauri 2 desktop client that authenticates to Confluence, browses spaces/pages, and exports selected content to Obsidian-compatible Markdown with attachments.

**Architecture:** Keep the React frontend responsible for UI state and Tauri command calls, the Rust backend responsible for authentication, secure storage, sidecar lifecycle, filesystem writes, and frontend progress events, and a Python sidecar responsible for Confluence API access plus Markdown conversion through `confluence-markdown-exporter`. Treat WebView SSO as the MVP primary authentication path, with manual API Token or Cookie entry as a required fallback. Ship post-MVP HTML export, search, and background sync as separate working increments after the Markdown MVP is usable.

**Tech Stack:** Tauri 2, React 18, TypeScript, Zustand, Rust, Python 3, `confluence-markdown-exporter==5.1.1`, PyInstaller, system keychain via Rust `keyring` or Stronghold if the team chooses encrypted app-local storage during implementation.

---

## Assumptions And Scope

- A greenfield rebuild inside this repository is allowed; existing scaffold files may be replaced when a task says so.
- Current scripts are `npm run dev`, `npm run build`, `npm run build:frontend`, and `npm run preview`; this plan adds test and sidecar scripts before using them.
- Current Tauri files are under `src-tauri/`; frontend files are under `src/`; the new Python sidecar will live under `sidecar/`.
- MVP targets macOS first. Windows packaging is verified before release, but Windows-specific polish is not part of the first working slice.
- No Java code is planned. If Java is added later, every AI-generated Java class or method must include `AI-GENERATED (Cursor)` in the required Javadoc or method comment.
- Secrets must never be written to normal config files, browser-visible logs, stdout protocol messages, or exported Markdown.

## File Structure Map

- `package.json`: add Vitest, sidecar helper scripts, and frontend test scripts.
- `src/lib/contracts.ts`: shared frontend request/response/event types.
- `src/lib/api.ts`: typed wrappers around Tauri commands.
- `src/stores/authStore.ts`: SSO/manual auth state and login actions.
- `src/stores/selectionStore.ts`: selected space/page tree state.
- `src/stores/exportStore.ts`: export options, progress, logs, and cancellation state.
- `src/components/AuthPanel/index.tsx`: SSO-first authentication UI with manual fallback.
- `src/components/SpaceBrowser/index.tsx`: space and page tree browsing.
- `src/components/ContentPreview/index.tsx`: selected page summary and export readiness.
- `src/components/ExportPanel/index.tsx`: Markdown export options and output directory selection.
- `src/components/ProgressPanel/index.tsx`: progress events and sanitized export log.
- `src-tauri/Cargo.toml`: add backend dependencies only when required by a task.
- `src-tauri/tauri.conf.json`: configure sidecar bundling through `bundle.externalBin`.
- `src-tauri/capabilities/default.json`: add exact permissions for sidecar execution, dialog access, and any WebView/window capability used by the implementation.
- `src-tauri/src/main.rs`: register commands and plugins.
- `src-tauri/src/contracts.rs`: Rust request/response/event types matching `src/lib/contracts.ts`.
- `src-tauri/src/auth/secret_store.rs`: keychain or Stronghold-backed secret storage.
- `src-tauri/src/auth/webview_auth.rs`: WebView SSO window and login-success detection.
- `src-tauri/src/sidecar/protocol.rs`: versioned JSON stdin/stdout protocol types.
- `src-tauri/src/sidecar/client.rs`: sidecar process wrapper and request handling.
- `src-tauri/src/export/file_writer.rs`: Obsidian-compatible Markdown and attachment writes.
- `sidecar/pyproject.toml`: Python package metadata and pinned exporter dependency.
- `sidecar/confluence_export_sidecar/__main__.py`: JSON-line sidecar entrypoint.
- `sidecar/confluence_export_sidecar/protocol.py`: Python protocol validation.
- `sidecar/confluence_export_sidecar/confluence_client.py`: Confluence API adapter.
- `sidecar/confluence_export_sidecar/exporter.py`: Markdown conversion and attachment manifest output.
- `sidecar/tests/`: sidecar protocol and exporter tests.

---

## Phase 1: Build A Testable Greenfield Shell

### Task 1: Add Shared Contracts And Test Scripts

**Files:**
- Modify: `package.json`
- Create: `src/lib/contracts.ts`
- Modify: `src/lib/api.ts`
- Create: `src/lib/contracts.test.ts`
- Create: `src-tauri/src/contracts.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add frontend test tooling scripts**

Update `package.json` with these scripts and dev dependencies using package-manager commands so lockfile updates are generated correctly:

```bash
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom
```

Expected `package.json` scripts after the edit:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "build": "tauri build",
  "build:frontend": "vite build"
}
```

- [ ] **Step 2: Define frontend contracts**

Create `src/lib/contracts.ts` with these exact exported types:

```typescript
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

export interface ExportOptions {
  pageIds: string[]
  outputDir: string
  format: 'markdown'
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
```

- [ ] **Step 3: Add a contract shape test**

Create `src/lib/contracts.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import type { ExportOptions, ExportProgressEvent } from './contracts'

describe('shared frontend contracts', () => {
  it('keeps markdown as the only MVP export format', () => {
    const options: ExportOptions = {
      pageIds: ['123'],
      outputDir: '/tmp/export-wiki',
      format: 'markdown',
      includeAttachments: true,
    }

    expect(options.format).toBe('markdown')
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
```

- [ ] **Step 4: Mirror the core contracts in Rust**

Create `src-tauri/src/contracts.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    Sso,
    ApiToken,
    Cookie,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub authenticated: bool,
    pub method: Option<AuthMethod>,
    pub base_url: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SpaceInfo {
    pub key: String,
    pub name: String,
    pub space_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PageNode {
    pub id: String,
    pub title: String,
    pub parent_id: Option<String>,
    pub children: Vec<PageNode>,
}
```

Add `mod contracts;` to `src-tauri/src/main.rs`.

- [ ] **Step 5: Run contract checks**

Run:

```bash
npm test -- src/lib/contracts.test.ts
```

Expected: Vitest reports `2 passed`.

Run:

```bash
(cd src-tauri && cargo test)
```

Expected: Cargo compiles the current backend and reports no failing tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/contracts.ts src/lib/contracts.test.ts src/lib/api.ts src-tauri/src/contracts.rs src-tauri/src/main.rs
git commit -m "chore: add shared Tauri app contracts"
```

### Task 2: Replace Demo IPC With Typed Command Stubs

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src-tauri/src/commands/auth.rs`
- Modify: `src-tauri/src/commands/export.rs`
- Create: `src-tauri/src/commands/spaces.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Update frontend API wrappers**

Replace the old demo wrapper names in `src/lib/api.ts` with:

```typescript
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
```

- [ ] **Step 2: Add Rust command stubs that return realistic empty states**

`start_sso_login` should return an error message that names SSO as not connected yet. `save_manual_auth` should accept manual config but not persist secrets until Task 6. `get_spaces` and `get_page_tree` should return empty vectors instead of demo data.

Expected Rust command names registered in `src-tauri/src/main.rs`:

```rust
commands::auth::start_sso_login,
commands::auth::save_manual_auth,
commands::auth::get_auth_status,
commands::auth::logout,
commands::spaces::get_spaces,
commands::spaces::get_page_tree,
commands::export::export_pages,
```

- [ ] **Step 3: Add Rust unit tests for command defaults**

Create tests inside the relevant command modules:

```rust
#[test]
fn unauthenticated_status_is_empty() {
    let status = super::unauthenticated_status();

    assert!(!status.authenticated);
    assert!(status.method.is_none());
    assert!(status.base_url.is_none());
}
```

- [ ] **Step 4: Verify backend stubs**

Run:

```bash
(cd src-tauri && cargo test)
```

Expected: command tests pass and no demo-space assertion remains.

Run:

```bash
npm run build:frontend
```

Expected: Vite builds `dist/` with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src-tauri/src/commands src-tauri/src/main.rs
git commit -m "refactor: replace demo IPC with typed stubs"
```

---

## Phase 2: Sidecar Protocol And Packaging

### Task 3: Build The Python Sidecar Protocol

**Files:**
- Create: `sidecar/pyproject.toml`
- Create: `sidecar/confluence_export_sidecar/__init__.py`
- Create: `sidecar/confluence_export_sidecar/__main__.py`
- Create: `sidecar/confluence_export_sidecar/protocol.py`
- Create: `sidecar/confluence_export_sidecar/confluence_client.py`
- Create: `sidecar/confluence_export_sidecar/exporter.py`
- Create: `sidecar/tests/test_protocol.py`
- Modify: `package.json`

- [ ] **Step 1: Add sidecar package metadata**

Create `sidecar/pyproject.toml`:

```toml
[project]
name = "confluence-export-sidecar"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
  "confluence-markdown-exporter==5.1.1",
]

[project.optional-dependencies]
dev = [
  "pytest>=8",
  "pyinstaller>=6",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 2: Define JSON-line request validation**

Create `sidecar/confluence_export_sidecar/protocol.py` with a `ProtocolError`, `parse_request(raw: str) -> dict`, and `success_response(request_id: str, payload: dict) -> dict`. Require every request to include `protocol_version: 1`, `request_id`, and `type`.

Core validation test in `sidecar/tests/test_protocol.py`:

```python
import json
import pytest

from confluence_export_sidecar.protocol import ProtocolError, parse_request, success_response


def test_parse_request_requires_protocol_version():
    with pytest.raises(ProtocolError, match="protocol_version"):
        parse_request(json.dumps({"request_id": "r1", "type": "get_spaces"}))


def test_success_response_keeps_request_id():
    response = success_response("r1", {"spaces": []})

    assert response == {
        "protocol_version": 1,
        "request_id": "r1",
        "ok": True,
        "payload": {"spaces": []},
    }
```

- [ ] **Step 3: Implement stdout-only protocol responses**

Create `sidecar/confluence_export_sidecar/__main__.py` so it reads one JSON request per line from stdin, writes one JSON response per line to stdout, and sends diagnostics to stderr.

Required command behavior for this task:

```python
if request["type"] == "ping":
    return success_response(request["request_id"], {"status": "ok"})
```

- [ ] **Step 4: Add sidecar scripts**

Add scripts to `package.json`:

```json
{
  "test:sidecar": "cd sidecar && python -m pytest",
  "build:sidecar": "cd sidecar && python -m PyInstaller --onefile --name cme-sidecar confluence_export_sidecar/__main__.py"
}
```

- [ ] **Step 5: Verify sidecar protocol**

Run:

```bash
(cd sidecar && python -m pytest)
```

Expected: pytest reports `2 passed` or more.

Run:

```bash
printf '{"protocol_version":1,"request_id":"r1","type":"ping"}\n' | python -m confluence_export_sidecar
```

Expected stdout contains one JSON object with `"ok": true` and `"status": "ok"`.

- [ ] **Step 6: Commit**

```bash
git add package.json sidecar
git commit -m "feat: add Python sidecar protocol"
```

### Task 4: Add Rust Sidecar Client And Tauri 2 Capabilities

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/sidecar/mod.rs`
- Create: `src-tauri/src/sidecar/protocol.rs`
- Create: `src-tauri/src/sidecar/client.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add Rust dependencies**

Run:

```bash
(cd src-tauri && cargo add uuid --features v4,serde)
(cd src-tauri && cargo add tokio --features process,io-util,macros,rt-multi-thread)
```

Expected: `src-tauri/Cargo.toml` contains non-optional `tokio` and `uuid`.

- [ ] **Step 2: Define sidecar protocol types**

Create `src-tauri/src/sidecar/protocol.rs` with:

```rust
use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SidecarRequest {
    pub protocol_version: u8,
    pub request_id: String,
    #[serde(rename = "type")]
    pub request_type: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SidecarResponse {
    pub protocol_version: u8,
    pub request_id: String,
    pub ok: bool,
    pub payload: serde_json::Value,
    pub error: Option<String>,
}
```

Add a unit test that serializes `SidecarRequest` and asserts it includes `"protocol_version":1` and `"type":"ping"`.

- [ ] **Step 3: Implement a minimal sidecar client wrapper**

Create `src-tauri/src/sidecar/client.rs` with a `SidecarClient` that can build a ping request and parse one JSON response. Keep process spawning in one function named `run_one_request` so command handlers can call it later.

Test the parser with:

```rust
#[test]
fn parses_successful_sidecar_response() {
    let raw = r#"{"protocol_version":1,"request_id":"r1","ok":true,"payload":{"status":"ok"},"error":null}"#;
    let response = super::parse_response(raw).expect("valid response");

    assert!(response.ok);
    assert_eq!(response.payload["status"], "ok");
}
```

- [ ] **Step 4: Configure Tauri sidecar packaging and permissions**

Update `src-tauri/tauri.conf.json`:

```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [],
    "externalBin": ["binaries/cme-sidecar"]
  }
}
```

Update `src-tauri/capabilities/default.json`:

```json
{
  "permissions": [
    "core:default",
    "shell:allow-open",
    {
      "identifier": "shell:allow-execute",
      "allow": [
        {
          "name": "binaries/cme-sidecar",
          "sidecar": true,
          "args": true
        }
      ]
    }
  ]
}
```

- [ ] **Step 5: Verify Rust sidecar protocol**

Run:

```bash
(cd src-tauri && cargo test sidecar)
```

Expected: sidecar protocol and parser tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/sidecar src-tauri/src/main.rs src-tauri/tauri.conf.json src-tauri/capabilities/default.json
git commit -m "feat: wire Tauri sidecar protocol"
```

---

## Phase 3: Authentication MVP

### Task 5: Secure Manual Auth Fallback

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/auth/mod.rs`
- Create: `src-tauri/src/auth/secret_store.rs`
- Modify: `src-tauri/src/commands/auth.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/stores/authStore.ts`
- Create: `src/components/AuthPanel/index.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add system keychain storage dependency**

Run:

```bash
(cd src-tauri && cargo add keyring)
```

Expected: `keyring` appears in `src-tauri/Cargo.toml`. If Stronghold is chosen instead during implementation, use `cargo add tauri-plugin-stronghold` and update this task's storage module to call Stronghold APIs while preserving the same command contract.

- [ ] **Step 2: Implement redacted secret storage**

Create `src-tauri/src/auth/secret_store.rs` with functions:

```rust
pub struct StoredCredential {
    pub base_url: String,
    pub method: crate::contracts::AuthMethod,
    pub username: Option<String>,
}

pub trait SecretStore {
    fn save_manual_auth(&self, config: &ManualAuthConfig) -> Result<StoredCredential, String>;
    fn load_status(&self) -> Result<crate::contracts::AuthStatus, String>;
    fn clear(&self) -> Result<(), String>;
}
```

Test with an in-memory store in the same file:

```rust
#[test]
fn status_does_not_include_secret_material() {
    let store = InMemorySecretStore::default();
    store
        .save_manual_auth(&ManualAuthConfig {
            base_url: "https://example.atlassian.net".into(),
            method: AuthMethod::ApiToken,
            username: Some("user@example.com".into()),
            api_token: Some("secret-token".into()),
            cookie: None,
        })
        .expect("save credentials");

    let status = store.load_status().expect("load status");
    let serialized = serde_json::to_string(&status).expect("serialize status");

    assert!(!serialized.contains("secret-token"));
    assert!(status.authenticated);
}
```

- [ ] **Step 3: Wire manual auth commands**

Update `save_manual_auth`, `get_auth_status`, and `logout` in `src-tauri/src/commands/auth.rs` to use the storage wrapper. `save_manual_auth` must validate:

- `base_url` starts with `https://`
- API token auth has both `username` and `apiToken`
- Cookie auth has `cookie`

Expected user-facing errors:

```text
Confluence URL must start with https://
API token authentication requires username and API token
Cookie authentication requires a cookie value
```

- [ ] **Step 4: Build manual fallback UI**

Replace `AuthForm` usage with `AuthPanel` in `src/App.tsx`. `AuthPanel` must show SSO as the primary action and a clearly labeled manual fallback with API Token and Cookie modes.

Minimum UI states:

- unauthenticated with base URL field
- manual API token fields
- manual cookie field
- authenticated summary with Logout
- sanitized error message

- [ ] **Step 5: Verify manual fallback**

Run:

```bash
(cd src-tauri && cargo test auth)
```

Expected: auth validation and secret redaction tests pass.

Run:

```bash
npm test -- src
```

Expected: frontend tests pass.

Run:

```bash
npm run build:frontend
```

Expected: Vite build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/auth src-tauri/src/commands/auth.rs src-tauri/src/main.rs src/App.tsx src/stores/authStore.ts src/components/AuthPanel
git commit -m "feat: add secure manual auth fallback"
```

### Task 6: Add WebView SSO As Primary Auth

**Files:**
- Create: `src-tauri/src/auth/webview_auth.rs`
- Modify: `src-tauri/src/auth/mod.rs`
- Modify: `src-tauri/src/commands/auth.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src/stores/authStore.ts`
- Modify: `src/components/AuthPanel/index.tsx`

- [ ] **Step 1: Implement login-success URL detection as a tested pure function**

Create this test in `src-tauri/src/auth/webview_auth.rs`:

```rust
#[test]
fn detects_confluence_wiki_urls_as_login_success() {
    assert!(is_login_success_url("https://example.atlassian.net/wiki/home"));
    assert!(is_login_success_url("https://example.atlassian.net/wiki/spaces/ENG"));
    assert!(!is_login_success_url("https://id.atlassian.com/login"));
}
```

Implement `is_login_success_url(url: &str) -> bool` using URL parsing rather than substring-only checks.

- [ ] **Step 2: Create the SSO WebView command**

Implement `start_sso_login(app: tauri::AppHandle, base_url: String) -> Result<AuthStatus, String>` so it:

- validates `https://`
- opens an auth WebView window labeled `confluence-sso`
- navigates to `${base_url}/wiki`
- detects successful navigation through `is_login_success_url`
- validates the session by calling the lightweight sidecar `get_current_user` command after cookies are available
- saves only the resulting credential/session material through `secret_store`

If HttpOnly cookies cannot be read on the current platform, return:

```text
SSO completed, but this platform did not expose reusable Confluence cookies. Use manual API Token or Cookie fallback.
```

- [ ] **Step 3: Add required Tauri window permission if frontend creates any auth window**

If the implementation creates the SSO WebView from the frontend, add:

```json
"core:webview:allow-create-webview-window"
```

to `src-tauri/capabilities/default.json`. If the Rust command owns the window entirely, keep the permission list limited to the backend-created window path.

- [ ] **Step 4: Connect the primary SSO button**

Update `AuthPanel` and `authStore` so the primary button calls `api.startSsoLogin(baseUrl)`. Manual fallback remains available without requiring failed SSO first.

- [ ] **Step 5: Verify SSO pieces**

Run:

```bash
(cd src-tauri && cargo test webview_auth)
```

Expected: URL detection tests pass.

Manual verification:

```bash
npm run dev
```

Expected: clicking SSO opens a Confluence login WebView, completing login either marks the app authenticated or shows the exact fallback message above without exposing cookies.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/auth src-tauri/src/commands/auth.rs src-tauri/src/main.rs src-tauri/capabilities/default.json src/stores/authStore.ts src/components/AuthPanel
git commit -m "feat: add WebView SSO login"
```

---

## Phase 4: Browse Confluence Content

### Task 7: Load Spaces And Page Trees Through The Sidecar

**Files:**
- Modify: `sidecar/confluence_export_sidecar/confluence_client.py`
- Modify: `sidecar/confluence_export_sidecar/__main__.py`
- Create: `sidecar/tests/test_confluence_client.py`
- Modify: `src-tauri/src/sidecar/client.rs`
- Modify: `src-tauri/src/commands/spaces.rs`
- Modify: `src/stores/selectionStore.ts`
- Create: `src/components/SpaceBrowser/index.tsx`
- Create: `src/components/ContentPreview/index.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add sidecar commands for browse data**

Implement sidecar request types:

- `get_spaces`
- `get_page_tree`
- `get_current_user`

`get_spaces` response payload shape:

```json
{
  "spaces": [
    { "key": "ENG", "name": "Engineering", "type": "global" }
  ]
}
```

`get_page_tree` response payload shape:

```json
{
  "pages": [
    { "id": "123", "title": "Home", "parentId": null, "children": [] }
  ]
}
```

- [ ] **Step 2: Test sidecar response normalization**

Create `sidecar/tests/test_confluence_client.py`:

```python
from confluence_export_sidecar.confluence_client import normalize_page_tree, normalize_spaces


def test_normalize_spaces_keeps_required_fields():
    raw = [{"key": "ENG", "name": "Engineering", "type": "global"}]

    assert normalize_spaces(raw) == [{"key": "ENG", "name": "Engineering", "type": "global"}]


def test_normalize_page_tree_uses_camel_case_parent_id():
    raw = [{"id": "123", "title": "Home", "parent_id": None, "children": []}]

    assert normalize_page_tree(raw) == [{"id": "123", "title": "Home", "parentId": None, "children": []}]
```

- [ ] **Step 3: Wire Rust browse commands**

Update `src-tauri/src/commands/spaces.rs` so `get_spaces` and `get_page_tree`:

- read the stored credential status
- reject unauthenticated calls with `Authentication required`
- call the sidecar through `SidecarClient`
- map sidecar payloads into `SpaceInfo` and `PageNode`

- [ ] **Step 4: Build browsing UI**

`SpaceBrowser` should load spaces after authentication, show a selected space, load page trees on demand, and let users toggle selected page IDs in `selectionStore`. `ContentPreview` should show the selected count and the selected page titles; it does not need to fetch full HTML during MVP.

- [ ] **Step 5: Verify browse flow**

Run:

```bash
(cd sidecar && python -m pytest)
```

Expected: sidecar tests pass.

Run:

```bash
(cd src-tauri && cargo test spaces)
```

Expected: browse command tests pass with mocked sidecar payloads.

Run:

```bash
npm run build:frontend
```

Expected: React build succeeds with `SpaceBrowser` mounted for authenticated users.

- [ ] **Step 6: Commit**

```bash
git add sidecar src-tauri/src/sidecar src-tauri/src/commands/spaces.rs src/stores/selectionStore.ts src/components/SpaceBrowser src/components/ContentPreview src/App.tsx
git commit -m "feat: browse Confluence spaces and pages"
```

---

## Phase 5: Markdown Export MVP

### Task 8: Export Markdown And Obsidian-Compatible Attachments

**Files:**
- Modify: `sidecar/confluence_export_sidecar/exporter.py`
- Modify: `sidecar/confluence_export_sidecar/__main__.py`
- Create: `sidecar/tests/test_exporter.py`
- Create: `src-tauri/src/export/mod.rs`
- Create: `src-tauri/src/export/file_writer.rs`
- Modify: `src-tauri/src/commands/export.rs`
- Modify: `src/stores/exportStore.ts`
- Create: `src/components/ExportPanel/index.tsx`
- Modify: `src/components/ProgressPanel/index.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Define sidecar export response shape**

The sidecar `export_pages` command returns page content and attachment manifests to Rust:

```json
{
  "pages": [
    {
      "pageId": "123",
      "title": "Home",
      "filename": "Home.md",
      "markdown": "# Home\n\n![diagram](attachments/diagram.png)\n",
      "attachments": [
        {
          "filename": "diagram.png",
          "relativePath": "attachments/diagram.png",
          "contentBase64": "iVBORw0KGgo="
        }
      ]
    }
  ]
}
```

Rust owns filesystem writes so the sidecar does not need desktop filesystem permissions.

- [ ] **Step 2: Test Obsidian attachment manifest handling**

Create `sidecar/tests/test_exporter.py`:

```python
from confluence_export_sidecar.exporter import build_attachment_manifest


def test_attachment_manifest_uses_obsidian_relative_paths():
    manifest = build_attachment_manifest("Home", [{"filename": "diagram.png", "content": b"abc"}])

    assert manifest[0]["filename"] == "diagram.png"
    assert manifest[0]["relativePath"] == "attachments/diagram.png"
    assert manifest[0]["contentBase64"] == "YWJj"
```

- [ ] **Step 3: Test Rust file writer**

Create `src-tauri/src/export/file_writer.rs` with filename sanitization, directory creation, Markdown writing, and attachment writing. Add this test:

```rust
#[test]
fn writes_markdown_and_attachment_under_output_dir() {
    let temp = tempfile::tempdir().expect("tempdir");
    let page = ExportedPage {
        page_id: "123".into(),
        title: "Home".into(),
        filename: "Home.md".into(),
        markdown: "# Home\n".into(),
        attachments: vec![ExportedAttachment {
            filename: "diagram.png".into(),
            relative_path: "attachments/diagram.png".into(),
            content_base64: "YWJj".into(),
        }],
    };

    write_exported_page(temp.path(), &page).expect("write page");

    assert!(temp.path().join("Home.md").exists());
    assert!(temp.path().join("attachments/diagram.png").exists());
}
```

Add `tempfile` and `base64` as dev/runtime dependencies only if the implementation uses them:

```bash
(cd src-tauri && cargo add base64)
(cd src-tauri && cargo add tempfile --dev)
```

- [ ] **Step 4: Wire export command and progress events**

Update `export_pages` to:

- reject empty `pageIds` with `Select at least one page to export`
- reject non-Markdown formats during MVP with `Only Markdown export is available in this build`
- call the sidecar `export_pages`
- write Markdown and attachments through `file_writer`
- emit `export-progress` events with `ExportProgressEvent`
- redact secrets from all errors before returning them to the frontend

- [ ] **Step 5: Build export UI**

`ExportPanel` must allow output directory entry or Tauri dialog selection, include an `includeAttachments` checkbox, and disable HTML export in MVP with explanatory text:

```text
HTML export is planned after the Markdown MVP is stable.
```

`ProgressPanel` should display progress percentage, stats, and sanitized log messages.

- [ ] **Step 6: Verify Markdown MVP**

Run:

```bash
(cd sidecar && python -m pytest)
```

Expected: exporter and protocol tests pass.

Run:

```bash
(cd src-tauri && cargo test export)
```

Expected: file writer and export command tests pass.

Run:

```bash
npm run build:frontend
```

Expected: frontend build succeeds.

Manual verification:

```bash
npm run dev
```

Expected: authenticate, load a space, select one page, export Markdown, then open the output folder and verify `.md` plus `attachments/` are present and usable in Obsidian.

- [ ] **Step 7: Commit**

```bash
git add sidecar src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/export src-tauri/src/commands/export.rs src/stores/exportStore.ts src/components/ExportPanel src/components/ProgressPanel src/App.tsx
git commit -m "feat: export Markdown with Obsidian attachments"
```

### Task 9: Package The MVP App With Sidecar

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`
- Create: `scripts/prepare-sidecar.mjs`
- Create: `docs/superpowers/manual-tests/confluence-tauri-mvp.md`

- [ ] **Step 1: Add a deterministic sidecar preparation script**

Create `scripts/prepare-sidecar.mjs` that copies the PyInstaller output from `sidecar/dist/cme-sidecar` into `src-tauri/binaries/cme-sidecar` on macOS and Linux, and `src-tauri/binaries/cme-sidecar.exe` on Windows.

Expected script behavior:

```text
Prepared sidecar binary at src-tauri/binaries/cme-sidecar
```

- [ ] **Step 2: Add package scripts**

Update `package.json`:

```json
{
  "prepare:sidecar": "npm run build:sidecar && node scripts/prepare-sidecar.mjs",
  "build:mvp": "npm run prepare:sidecar && npm run build"
}
```

- [ ] **Step 3: Add manual MVP test document**

Create `docs/superpowers/manual-tests/confluence-tauri-mvp.md` with these exact checks:

```markdown
# Confluence Tauri MVP Manual Test

- [ ] `npm run dev` opens the app on macOS.
- [ ] SSO login completes or shows the manual fallback message without leaking cookies.
- [ ] Manual API Token auth validates against the current user endpoint.
- [ ] Spaces load after authentication.
- [ ] Page tree loads after selecting a space.
- [ ] Exporting one page creates one Markdown file.
- [ ] Exporting one page with one image creates `attachments/<image-name>`.
- [ ] Opening the export folder in Obsidian renders links and images.
- [ ] Logs and returned errors do not contain Cookie, API Token, or password values.
```

- [ ] **Step 4: Verify packaging**

Run:

```bash
npm run build:mvp
```

Expected: sidecar binary is copied, frontend builds, Rust builds, and Tauri produces a macOS bundle.

Run:

```bash
(cd src-tauri && cargo test)
```

Expected: all Rust tests pass.

Run:

```bash
npm test
```

Expected: all frontend tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/prepare-sidecar.mjs src-tauri/tauri.conf.json src-tauri/capabilities/default.json docs/superpowers/manual-tests/confluence-tauri-mvp.md
git commit -m "chore: package Tauri Markdown MVP"
```

---

## Phase 6: Post-MVP Working Increments

### Task 10: Add HTML Export After Markdown Stabilizes

**Files:**
- Modify: `src/lib/contracts.ts`
- Modify: `sidecar/confluence_export_sidecar/exporter.py`
- Modify: `sidecar/tests/test_exporter.py`
- Modify: `src-tauri/src/export/file_writer.rs`
- Modify: `src-tauri/src/commands/export.rs`
- Modify: `src/components/ExportPanel/index.tsx`

- [ ] **Step 1: Expand export format contract**

Change frontend and Rust export format contracts from only `markdown` to:

```typescript
export type ExportFormat = 'markdown' | 'html'
```

Keep Markdown as the default in `exportStore`.

- [ ] **Step 2: Add sidecar HTML output test**

Add a test proving HTML export returns `.html` filenames and leaves attachments under `attachments/`:

```python
def test_html_export_uses_html_filename():
    page = build_exported_page(page_id="123", title="Home", content="<h1>Home</h1>", format="html", attachments=[])

    assert page["filename"] == "Home.html"
    assert page["html"] == "<h1>Home</h1>"
```

- [ ] **Step 3: Update Rust writer for HTML content**

Add writer support for `html` content while keeping the same attachment path rules. Tests must assert `.md` and `.html` paths are distinct.

- [ ] **Step 4: Enable HTML in the UI**

Remove the disabled explanatory copy from `ExportPanel` and let users choose Markdown or HTML.

- [ ] **Step 5: Verify HTML increment**

Run:

```bash
(cd sidecar && python -m pytest)
(cd src-tauri && cargo test export)
npm run build:frontend
```

Expected: all three commands pass, and HTML is selectable only after writer and sidecar support exists.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contracts.ts sidecar src-tauri/src/export/file_writer.rs src-tauri/src/commands/export.rs src/components/ExportPanel/index.tsx
git commit -m "feat: add HTML export"
```

### Task 11: Add Search And Direct URL Navigation

**Files:**
- Modify: `src/lib/contracts.ts`
- Modify: `sidecar/confluence_export_sidecar/confluence_client.py`
- Create: `sidecar/tests/test_search.py`
- Modify: `src-tauri/src/commands/spaces.rs`
- Modify: `src/stores/selectionStore.ts`
- Modify: `src/components/SpaceBrowser/index.tsx`

- [ ] **Step 1: Add search contracts**

Add:

```typescript
export interface SearchResult {
  pageId: string
  title: string
  spaceKey: string
  excerpt: string
}
```

Rust should mirror this as `SearchResult`.

- [ ] **Step 2: Add sidecar search command**

Implement `search_pages` using Confluence CQL and normalize results to `SearchResult`.

Test:

```python
from confluence_export_sidecar.confluence_client import normalize_search_results


def test_normalize_search_results_strips_html_excerpt():
    raw = [{"id": "123", "title": "Home", "spaceKey": "ENG", "excerpt": "<strong>Hello</strong>"}]

    assert normalize_search_results(raw)[0]["excerpt"] == "Hello"
```

- [ ] **Step 3: Add direct URL parser**

Implement a pure parser that accepts Confluence page URLs and returns a page ID or space key. Reject non-Confluence URLs with `Enter a Confluence page or space URL`.

- [ ] **Step 4: Verify search increment**

Run:

```bash
(cd sidecar && python -m pytest)
(cd src-tauri && cargo test spaces)
npm run build:frontend
```

Expected: search normalization, URL parser, and frontend build all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contracts.ts sidecar src-tauri/src/commands/spaces.rs src/stores/selectionStore.ts src/components/SpaceBrowser/index.tsx
git commit -m "feat: add Confluence search and URL navigation"
```

### Task 12: Add Background Sync As An Opt-In Feature

**Files:**
- Modify: `src/lib/contracts.ts`
- Create: `src-tauri/src/sync/mod.rs`
- Create: `src-tauri/src/sync/scheduler.rs`
- Modify: `src-tauri/src/commands/config.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/stores/configStore.ts`
- Modify: `src/components/SettingsPanel/index.tsx`

- [ ] **Step 1: Define sync settings**

Add:

```typescript
export interface SyncSettings {
  enabled: boolean
  intervalMinutes: number
  outputDir: string
  pageIds: string[]
}
```

Default settings must be disabled:

```typescript
export const defaultSyncSettings: SyncSettings = {
  enabled: false,
  intervalMinutes: 60,
  outputDir: '',
  pageIds: [],
}
```

- [ ] **Step 2: Implement scheduler tests**

Create `src-tauri/src/sync/scheduler.rs` with a pure `next_run_after` function and this test:

```rust
#[test]
fn disabled_sync_has_no_next_run() {
    let settings = SyncSettings {
        enabled: false,
        interval_minutes: 60,
        output_dir: "/tmp/export-wiki".into(),
        page_ids: vec!["123".into()],
    };

    assert!(next_run_after(&settings, chrono::Utc::now()).is_none());
}
```

Add `chrono` only when this task starts:

```bash
(cd src-tauri && cargo add chrono --features serde)
```

- [ ] **Step 3: Add settings UI**

`SettingsPanel` must show a disabled-by-default background sync section, interval input, selected-page count, output directory, and a clear warning:

```text
Background sync uses the saved credential and runs only while the desktop app is open.
```

- [ ] **Step 4: Verify sync increment**

Run:

```bash
(cd src-tauri && cargo test sync)
npm run build:frontend
```

Expected: scheduler tests and frontend build pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contracts.ts src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/sync src-tauri/src/commands/config.rs src-tauri/src/main.rs src/stores/configStore.ts src/components/SettingsPanel/index.tsx
git commit -m "feat: add opt-in background sync settings"
```

---

## Final Verification Before Release

- [ ] Run frontend tests:

```bash
npm test
```

Expected: all Vitest suites pass.

- [ ] Run sidecar tests:

```bash
(cd sidecar && python -m pytest)
```

Expected: all pytest suites pass.

- [ ] Run Rust tests:

```bash
(cd src-tauri && cargo test)
```

Expected: all Rust unit tests pass.

- [ ] Build packaged MVP:

```bash
npm run build:mvp
```

Expected: Tauri build completes and includes the `cme-sidecar` binary declared in `src-tauri/tauri.conf.json`.

- [ ] Complete manual MVP test:

```bash
open docs/superpowers/manual-tests/confluence-tauri-mvp.md
```

Expected: every checklist item can be checked on macOS without credentials appearing in logs, errors, or exported files.

## Self-Review Notes

- Spec coverage: MVP tasks cover WebView SSO, manual API Token/Cookie fallback, secure storage, space/page browsing, sidecar capabilities, Markdown export, Obsidian attachments, progress display, and packaging. Post-MVP tasks cover HTML export, search/direct URL input, and background sync.
- Type consistency: frontend contracts and Rust contracts use the same camelCase external JSON shapes; sidecar protocol uses `protocol_version`, `request_id`, `type`, `ok`, `payload`, and `error`.
- Scope control: each phase leaves working software; HTML, search, and background sync are not mixed into the Markdown MVP.
