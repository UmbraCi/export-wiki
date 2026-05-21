# Confluence Wiki Tauri Desktop Client Design

## Context

用户希望将现有的 `confluence-markdown-exporter` Python CLI 工具迁移为 Tauri 桌面应用。目标是创建一个完整的 Confluence 浏览客户端，支持：

- 可视化浏览 Confluence 内容（Space 和 Page 树形结构）
- SSO 网页登录自动获取认证凭证
- 导出为 Markdown 和 HTML 格式
- Obsidian 兼容的导出结果

**为什么选择 Sidecar 方案而非纯 Rust 重写：**

1. `confluence-markdown-exporter` 已发布到 PyPI（MIT 许可证），可直接引用
2. 现有 Markdown 转换逻辑完善（处理复杂宏、表格、附件）
3. Sidecar 方案便于更新（上游库更新后重新打包即可）
4. MVP 快速实现，后续可逐步迁移核心逻辑到 Rust

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 React Frontend                        │   │
│  │                                                       │   │
│  │   - 登录窗口触发                                       │   │
│  │   - Space/Page 树形结构浏览                           │   │
│  │   - 导出选项配置                                       │   │
│  │   - 进度显示                                           │   │
│  │                                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓ Tauri IPC                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 Rust Backend                          │   │
│  │                                                       │   │
│  │   - Tauri Command Handlers                            │   │
│  │   - Cookie 管理（提取、安全存储、传递）               │   │
│  │   - Sidecar 进程管理                                  │   │
│  │   - 文件系统操作                                       │   │
│  │   - 进度事件转发                                       │   │
│  │                                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓ stdin/stdout JSON               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Python Sidecar (打包的可执行文件)           │   │
│  │                                                       │   │
│  │   Dependencies:                                       │   │
│  │     - confluence-markdown-exporter (PyPI 5.1.1)      │   │
│  │                                                       │   │
│  │   功能:                                               │   │
│  │     - Confluence API 调用                             │   │
│  │     - HTML → Markdown 转换                            │   │
│  │     - 附件下载                                         │   │
│  │     - 返回结果给 Rust                                 │   │
│  │                                                       │   │
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
使用 Tauri WebView API 或 JS 注入
        ↓
Cookie 安全存储
使用 tauri-plugin-store 或系统密钥库
        ↓
关闭 WebView 窗口
主界面显示"已登录"状态
```

**技术实现:**

| 组件 | 实现 |
|------|------|
| WebView 窗口 | `WebviewWindowBuilder` 独立窗口 |
| URL 监听 | `on_navigation` 事件 |
| Cookie 提取 | JavaScript `document.cookie` 或 Tauri API |
| 安全存储 | `tauri-plugin-store` |

**备选认证方式:** 如 WebView 方案失败，提供手动输入 API Token 或 Cookie 的配置面板。

---

## Frontend Structure

**React 组件结构:**

```
src/
├── components/
│   ├── Header.tsx          // 连接状态、Logout 按钮
│   ├── Sidebar.tsx         // 导航侧边栏
│   ├── SpaceTree.tsx       // Space/Page 树形结构
│   ├── ContentPreview.tsx  // 页面内容预览
│   ├── ExportPanel.tsx     // 导出选项配置
│   ├── ProgressFooter.tsx  // 导出进度显示
│   └── LoginModal.tsx      // 登录触发组件
│
├── hooks/
│   ├── useAuth.ts          // 认证状态管理
│   ├── useSpaces.ts        // Space 列表
│   ├── usePages.ts         // Page 树
│   ├── useExport.ts        // 导出操作
│
├── services/
│   └── tauriApi.ts         // Tauri IPC 封装
│
└── App.tsx                 // 主应用
```

**UI Layout:**

- Header: 显示连接状态、Confluence 实例 URL、Logout 按钮
- Sidebar: 搜索框 + Space 列表 + Page 树形结构
- Main: 页面内容预览 + 导出选项面板
- Footer: 导出进度条

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
│   └── webview_auth.rs     // WebView 管理
│
└── export/
│   ├── file_writer.rs      // 文件写入
│   └ progress_tracker.rs   // 进度追踪
```

**Key Tauri Commands:**

```rust
#[tauri::command]
async fn get_spaces(cookie: String) -> Result<Vec<SpaceInfo>, String>;

#[tauri::command]
async fn get_page_tree(cookie: String, space_key: String) -> Result<Vec<PageNode>, String>;

#[tauri::command]
async fn export_pages(
    cookie: String,
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

---

## Export Workflow

```
用户选择页面 + 配置导出选项
        ↓
React invoke('export_pages', params)
        ↓
Rust 获取 cookies + 发送命令到 Sidecar
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
| WebView SSO Login | ✅ Required | Core authentication |
| Cookie Auto-Extract | ✅ Required |配合 login |
| Space Tree Browse | ✅ Required | Basic navigation |
| Page Tree Browse | ✅ Required | Select export content |
| Markdown Export | ✅ Required | Core functionality |
| Progress Display | ✅ Required | Basic UX |
| Export Directory Select | File operation |
| Obsidian Compatible | ✅ Required | Use existing conversion |
| HTML Export | ⏳ Post-MVP | Phase 3 |
| Search | ⏳ Post-MVP | Phase 2 |
| URL Direct Input | ⏳ Post-MVP | Phase 2 |

**Tech Stack:**

- Frontend: React + TypeScript + Ant Design/shadcn/ui
- Backend: Tauri 2.0 + Rust
- Sidecar: Python + confluence-markdown-exporter 5.1.1 + PyInstaller

---

## Testing & Verification

**MVP Success Criteria:**

1. User can complete SSO login via WebView
2. User can browse Space and Page tree structure
3. User can select pages and export to Markdown
4. Exported content displays correctly in Obsidian
5. Progress bar shows export progress accurately
6. App packages and runs on macOS/Windows

**Test Layers:**

| Level | Method | Tool |
|-------|--------|------|
| Rust unit tests | Sidecar IPC mock | `cargo test` |
| Sidecar tests | Independent scripts | `pytest` |
| React tests | Component rendering | Vitest |
| Integration | Full export flow | Manual + CI |

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

- [confluence-markdown-exporter PyPI](https://pypi.org/project/confluence-markdown-exporter)
- [Tauri Documentation](https://tauri.app)
- [PyInstaller Documentation](https://pyinstaller.org)