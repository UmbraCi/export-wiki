---
name: tauri-confluence-browser
description: Tauri desktop client for Confluence wiki browsing and Markdown export
---

# Confluence Wiki Exporter Tauri Greenfield Design

## Context

本文档描述当前项目选定的绿地重建方案：以 Tauri 2 + React + Rust + Python Sidecar 构建 Confluence Wiki 桌面导出客户端。已有局部实现可作为参考，但不约束后续架构；实施时可以按本文档重新组织前端、后端和 Sidecar 边界。

目标是创建一个完整的 Confluence 浏览客户端，支持：

- 可视化浏览 Confluence 内容（Space 和 Page 树形结构）
- WebView SSO 登录并自动获取认证 Cookie
- 导出为 Markdown 格式
- Obsidian 兼容的导出结果
- 手动 API Token / Cookie 配置作为认证兜底方案

**为什么选择 Sidecar 方案而非纯 Rust 重写：**

1. `confluence-markdown-exporter` 已发布到 PyPI（MIT 许可证），可直接引用
2. 现有 Markdown 转换逻辑完善（处理复杂宏、表格、附件）
3. Sidecar 方案便于更新（上游库更新后重新打包即可）
4. MVP 快速实现，后续可逐步迁移核心逻辑到 Rust

**本文档状态：** 架构设计文档。它定义绿地重建方向、模块边界、关键风险和验证标准；不是逐步执行计划。

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 React Frontend                        │   │
│  │                                                       │
│  │   - 登录窗口触发                                       │
│  │   - Space/Page 树形结构浏览                           │
│  │   - 导出选项配置                                       │
│  │   - 进度显示                                           │
│  │                                                       │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓ Tauri IPC                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 Rust Backend                          │
│  │                                                       │
│  │   - Tauri Command Handlers                            │
│  │   - Cookie 管理（提取、安全存储、传递）               │
│  │   - Sidecar 进程管理                                  │
│  │   - 文件系统操作                                       │
│  │   - 进度事件转发                                       │
│  │                                                       │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓ stdin/stdout JSON               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Python Sidecar (打包的可执行文件)           │
│  │                                                       │
│  │   Dependencies:                                       │
│  │     - confluence-markdown-exporter (PyPI 5.1.1)      │
│  │                                                       │
│  │   功能:                                               │
│  │     - Confluence API 调用                             │
│  │     - HTML → Markdown 转换                            │
│  │     - 附件下载                                         │
│  │     - 返回结果给 Rust                                 │
│  │                                                       │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Authentication Flow

**SSO WebView Login Flow:**

```
用户点击"登录"按钮
        ↓
Tauri WebView 窗口打开
加载 Confluence 登录页面 (https://company.atlassian.net)
        ↓
用户完成 SSO 认证
（用户名密码 / SAML / 2FA）
        ↓
WebView 导航监听检测登录成功
URL 变化检测（如: /wiki/home, /spaces/...）
        ↓
Rust 提取 WebView Cookies
优先使用 Tauri/WebView 可用 API；必要时使用注入脚本读取非 HttpOnly Cookie
        ↓
Cookie 安全存储
使用 Stronghold 或系统密钥库，不写入普通配置文件
        ↓
关闭 WebView 窗口
主界面显示"已登录"状态
```

**技术实现:**

| 组件 | 实现 |
|------|------|
| WebView 窗口 | `WebviewWindowBuilder` 独立窗口 |
| URL 监听 | `on_navigation` 事件 |
| Cookie 提取 | Tauri/WebView 会话能力验证；必要时注入脚本读取可见 Cookie |
| 安全存储 | `tauri-plugin-stronghold` 或系统 Keychain/Credential Manager |
| 登录成功判定 | URL 进入 `/wiki` 页面且可调用 Confluence 当前用户 API |
| 兜底认证 | 手动 API Token / Cookie 输入 |

**设计约束:**

- WebView Cookie 读取能力与平台、Cookie 属性、Confluence 部署方式相关。HttpOnly Cookie 不能依赖 `document.cookie` 读取，必须在实现阶段验证 Tauri 2 对应平台的可用 API。
- WebView SSO 是 MVP 主路径；手动 API Token / Cookie 输入是兜底路径，不作为默认体验。
- Cookie、API Token、密码和导出日志必须分离处理。日志只记录认证方式、域名和错误类型，不记录完整 Cookie、Token 或密码。
- 登录后先执行轻量连接验证，例如读取当前用户或 Space 列表，再认为认证成功。

---

## Frontend Structure

**React 组件结构:**

```
src/
├── components/
│   ├── Layout/             // 主窗口布局
│   ├── Header/             // 连接状态、主题、Logout 按钮
│   ├── AuthPanel/          // SSO 登录入口 + 手动认证兜底
│   ├── SpaceBrowser/       // Space/Page 树形结构
│   ├── ContentPreview/     // 页面内容预览
│   ├── ExportPanel/        // 导出选项配置
│   ├── ProgressPanel/      // 导出进度和日志
│   └── common/             // Button/Input/Modal/Toast 等项目自有组件
│
├── stores/
│   ├── authStore.ts        // 认证状态和登录流程
│   ├── selectionStore.ts   // Space/Page 选择
│   ├── exportStore.ts      // 导出选项、进度、日志
│   └── configStore.ts      // 非敏感配置
│
├── lib/
│   └── api.ts              // Tauri IPC 封装
│
└── App.tsx                 // 主应用
```

**UI Layout:**

- Header: 显示连接状态、Confluence 实例 URL、Logout 按钮
- Left pane: Space 列表 + Page 树形结构
- Main pane: 页面内容预览 + 选择状态
- Right pane: 导出选项面板
- Footer/Modal: 导出进度、日志和完成总结

**UI Strategy:** 使用 React + TypeScript + Zustand + 项目自有 Tailwind 组件。不要同时引入 Ant Design 与 shadcn/ui；除非后续明确需要第三方组件库，否则优先保持依赖简单。

---

## Backend Structure

**Rust Module Structure:**

```rust
src-tauri/src/
├── main.rs                 // Tauri 入口
├── commands/
│   ├── auth.rs             // 认证 commands
│   ├── spaces.rs           // Space 列表
│   ├── pages.rs            // Page 树
│   ├── export.rs           // 导出执行
│   └── config.rs           // 配置管理
│
├── sidecar/
│   ├── manager.rs          // 进程管理
│   ├── protocol.rs         // IPC 协议
│   └── client.rs           // 通信客户端
│
├── auth/
│   ├── cookie_store.rs     // Cookie 存储
│   ├── secret_store.rs     // Stronghold/系统密钥库封装
│   └── webview_auth.rs     // WebView 管理
│
└── export/
│   ├── file_writer.rs      // 文件写入
│   └ progress_tracker.rs   // 进度追踪
```

**Key Tauri Commands:**

```rust
#[tauri::command]
async fn start_sso_login(app: tauri::AppHandle, base_url: String) -> Result<LoginSession, String>;

#[tauri::command]
async fn save_manual_auth(auth: ManualAuthConfig) -> Result<AuthStatus, String>;

#[tauri::command]
async fn get_spaces() -> Result<Vec<SpaceInfo>, String>;

#[tauri::command]
async fn get_page_tree(space_key: String) -> Result<Vec<PageNode>, String>;

#[tauri::command]
async fn export_pages(
    page_ids: Vec<String>,
    format: String,  // "markdown" | "html"
    output_path: String,
    app: tauri::AppHandle
) -> Result<(), String>;
```

---

## Python Sidecar Interface

**Sidecar Entry Script:**

```python
# sidecar_entry.py
import sys
import json

def main():
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        command = json.loads(line)
        result = handle_command(command)
        sys.stdout.write(json.dumps(result) + "\n")
        sys.stdout.flush()

def handle_command(cmd: dict) -> dict:
    cmd_type = cmd["type"]
    if cmd_type == "get_spaces":
        return get_spaces(cmd["cookie"])
    elif cmd_type == "get_page_tree":
        return get_page_tree(cmd["cookie"], cmd["space_key"])
    elif cmd_type == "export_pages":
        return export_pages(cmd)
    # ... more handlers
```

**IPC Protocol:**

```json
// Request
{
    "type": "export_pages",
    "cookie": "serialized_cookies",
    "page_ids": ["123", "456"],
    "format": "markdown",
    "output_path": "/path/to/export",
    "options": {
        "include_attachments": true
    }
}

// Progress Event
{
    "event": "progress",
    "page_id": "123",
    "status": "converting",
    "progress": 0.5
}

// Complete Event
{
    "event": "complete",
    "exported": 2,
    "skipped": 0,
    "failed": 0
}
```

**Sidecar Packaging:**

```bash
# Build sidecar executable
pyinstaller --onefile --name cme-sidecar sidecar_entry.py

# Place in Tauri binaries directory
cp dist/cme-sidecar src-tauri/binaries/
```

**Tauri 2 Sidecar Configuration:**

Sidecar execution must be declared explicitly in Tauri 2 capabilities. The design assumes Rust owns sidecar lifecycle, but the same binary still needs allowlist-style permission configuration.

```json
{
  "permissions": [
    "core:default",
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

**Packaging constraints:**

- Build one sidecar binary per target platform and architecture.
- Keep the Sidecar protocol versioned, e.g. every request includes `"protocol_version": 1`.
- Bundle only the exporter runtime and required dependencies; avoid using a developer Python environment at runtime.
- Rust backend starts, monitors, and stops the sidecar. Frontend never invokes sidecar directly.
- Sidecar stdout is reserved for JSON protocol messages. Diagnostic logs should go to stderr so Rust can route them safely.

---

## Export Workflow

```
用户选择页面 + 配置导出选项
        ↓
React invoke('export_pages', params)
        ↓
Rust 从安全存储读取认证凭证 + 发送命令到 Sidecar
        ↓
Sidecar 执行转换（遍历 page_ids）
        ↓
Sidecar 输出进度事件到 stdout
        ↓
Rust 解析事件 + 写入文件 + emit 到前端
        ↓
React 更新进度条
        ↓
完成显示总结
```

**File Write Strategy:**

Sidecar 返回转换后的文本内容，Rust 执行实际文件写入：

```rust
fn write_export_file(output_path: &str, content: &str, filename: &str) -> Result<()> {
    let full_path = PathBuf::from(output_path).join(filename);
    fs::create_dir_all(full_path.parent()?)?;
    fs::write(&full_path, content)?;
    Ok(())
}
```

This avoids cross-platform path issues and unifies permission handling.

---

## MVP Scope

| Feature | MVP Status | Notes |
|---------|------------|-------|
| WebView SSO Login | Required | Primary authentication path |
| Cookie Auto-Extract | Required | Extract and persist session cookies after login |
| Manual API Token / Cookie Input | Required fallback | Used when WebView SSO extraction fails |
| Space Tree Browse | Required | Basic navigation |
| Page Tree Browse | Required | Select export content |
| Markdown Export | Required | Core functionality |
| Attachment Export | Required | Needed for useful Obsidian output |
| Progress Display | Required | Basic UX |
| Export Directory Select | Required | File operation |
| Obsidian Compatible | Required | Use existing conversion behavior where possible |
| HTML Export | Post-MVP | Phase 3 |
| Search | Post-MVP | Phase 2 |
| URL Direct Input | Post-MVP | Phase 2 |

**Tech Stack:**

- Frontend: React + TypeScript + Zustand + project-owned Tailwind components
- Backend: Tauri 2.0 + Rust
- Sidecar: Python + confluence-markdown-exporter 5.1.1 + PyInstaller
- Secure storage: Stronghold or system keychain integration for cookies/tokens

---

## Testing & Verification

**Design Readiness Criteria:**

Before implementation starts, the team should be able to answer these questions from this document:

1. Which process owns authentication, secret storage, sidecar lifecycle, file writing, and UI state?
2. Which authentication path is MVP, and what happens if WebView cookie extraction fails?
3. How does the sidecar communicate progress without mixing logs into stdout JSON?
4. Which features are explicitly post-MVP and should not be built during the first implementation pass?

**MVP Success Criteria:**

1. User can complete SSO login via WebView
2. App can validate the authenticated session by calling a lightweight Confluence API
3. User can browse Space and Page tree structure
4. User can select pages and export to Markdown
5. Exported content displays correctly in Obsidian, including linked attachments
6. Progress bar and export log show export progress accurately
7. App packages and runs on macOS first; Windows packaging is verified before release

**Test Layers:**

| Level | Method | Tool |
|-------|--------|------|
| Rust unit tests | Sidecar IPC mock | `cargo test` |
| Sidecar tests | Independent scripts | `pytest` |
| React tests | Component/store rendering | Vitest |
| Integration | Full export flow | Manual + CI |

**Initial verification commands after implementation:**

```bash
npm run build
cd src-tauri && cargo test
```

Manual verification starts with macOS:

1. Open app and complete WebView SSO login.
2. Confirm authenticated state by loading Spaces.
3. Export one small page with one attachment.
4. Open the result in Obsidian and verify links, images, and Markdown headings.

---

## Risks & Decisions

| Risk | Impact | Design Response |
|------|--------|-----------------|
| WebView Cookie extraction differs by OS and cookie attributes | SSO may work in browser but fail in app | Treat cookie extraction as a spike in the first implementation phase; keep manual API Token/Cookie fallback |
| Confluence Cloud and Server/Data Center auth differ | One auth flow may not cover all deployments | MVP optimizes for WebView SSO and validates with a real API call after login |
| Secret leakage through config or logs | High security risk | Store secrets in Stronghold/system keychain; redact Cookie/Token/password values from logs and errors |
| Sidecar packaging differs per platform/architecture | Build may pass locally but fail in release | Build platform-specific sidecars and declare Tauri 2 sidecar capabilities explicitly |
| PyInstaller binary size and signing/notarization | Distribution friction on macOS/Windows | Verify packaging early on macOS, then repeat on Windows before release |
| Sidecar stdout includes non-JSON logs | Rust protocol parser can fail during export | Reserve stdout for JSON protocol messages; route diagnostics through stderr |
| Upstream exporter API changes | Sidecar commands may break after dependency updates | Pin exporter version for MVP and include protocol/version checks |
| Large exports block UI or exhaust memory | Poor user experience | Stream progress events and write files incrementally where possible |

---

## Iteration Roadmap

```
Phase 1 (MVP): Basic browse + Markdown export
Phase 2: URL input + Search
Phase 3: HTML export + Batch optimization
Phase 4: Config management + Custom options
Phase 5: Background sync + Scheduled export
```

---

## References

- [[confluence-markdown-exporter PyPI](https://pypi.org/project/confluence-markdown-exporter)]
- [[Tauri Documentation](https://tauri.app)]
- [[PyInstaller Documentation](https://pyinstaller.org)]
