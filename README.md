# Export Wiki

**Confluence Wiki Exporter** — a desktop app for exporting Confluence pages to local files.

[English](#english) · [中文](#中文)

---

## English

### Overview

Export Wiki is a cross-platform desktop application built with **Tauri 2**. It connects to Atlassian Confluence (Cloud or self-hosted), lets you browse and select pages, and exports them to **Markdown** (Obsidian-compatible) or **HTML**, with optional attachment downloads.

The UI supports **English** and **Simplified Chinese**.

### Features

| Area | Description |
|------|-------------|
| **Authentication** | SSO via embedded browser window, plus manual fallback with API token or session cookie |
| **Space browser** | List spaces, browse page trees, multi-select pages for export |
| **Search & navigation** | Search pages by title; open a page directly from a Confluence URL |
| **Export formats** | Markdown (`.md`) or HTML (`.html`) |
| **Attachments** | Download images and files into a local `attachments/` folder |
| **Incremental export** | Skip pages unchanged since the last run |
| **Background sync** | Periodically re-export selected pages while the app is open (opt-in) |
| **Progress tracking** | Live export status, statistics, and logs |

### Architecture

```
React + TypeScript (UI)
        ↕ IPC
Rust / Tauri (auth, config, file I/O, orchestration)
        ↕ stdio JSON
Python sidecar (Confluence API + conversion via confluence-markdown-exporter)
```

### Requirements

- **Node.js** 18+
- **Rust** toolchain ([rustup](https://rustup.rs/))
- **uv** (Python package manager) — installed automatically by setup on macOS/Linux
- **Python** 3.10+ (managed by uv)

macOS developers also need Xcode Command Line Tools (`xcode-select --install`).

### Quick Start

```bash
# Install dependencies (Node, uv sidecar, dev shim)
npm run setup

# Run in development mode
npm start
```

### Build

```bash
# Build the Python sidecar binary, then package the desktop app
npm run build:mvp
```

Other useful scripts:

| Command | Description |
|---------|-------------|
| `npm test` | Run frontend unit tests |
| `npm run test:sidecar` | Run Python sidecar tests |
| `npm run build:frontend` | Build the web UI only |
| `npm run icon` | Regenerate app icons from `src-tauri/icons/icon-source.png` |

### Usage

1. **Sign in** — Enter your Confluence base URL and authenticate (SSO, API token, or cookie).
2. **Browse** — Pick a space, search pages, or paste a Confluence page URL.
3. **Select** — Check the pages you want to export.
4. **Export** — Choose output directory, format, and attachment options, then start export.
5. **Settings** — Configure skip-unchanged, background sync, language, and theme.

### Authentication Notes

- **SSO**: A secure login window opens for IdP sign-in. After the wiki session is detected, the app connects automatically.
- **API token**: Use your Atlassian account email and an API token from Atlassian Account Settings.
- **Session cookie**: Copy the full cookie header from browser DevTools after signing in (include `seraph.confluence`, not only `JSESSIONID`).

Credentials are stored locally on your machine.

### License

[MIT](LICENSE)

---

## 中文

### 概述

Export Wiki 是一款基于 **Tauri 2** 的跨平台桌面应用，用于连接 Atlassian Confluence（云端或自建实例），浏览并选择页面，导出为 **Markdown**（兼容 Obsidian）或 **HTML**，并可选下载附件。

界面支持 **English** 与 **简体中文**。

### 功能特性

| 模块 | 说明 |
|------|------|
| **认证登录** | 嵌入式浏览器 SSO 登录；也支持 API 令牌或会话 Cookie 手动登录 |
| **空间浏览** | 列出空间、浏览页面树、多选待导出页面 |
| **搜索与导航** | 按标题搜索页面；粘贴 Confluence URL 直接定位页面 |
| **导出格式** | Markdown（`.md`）或 HTML（`.html`） |
| **附件下载** | 将图片与文件保存到本地 `attachments/` 目录 |
| **增量导出** | 跳过自上次导出以来未修改的页面 |
| **后台同步** | 应用打开时可定时重新导出已选页面（默认关闭，需手动开启） |
| **进度追踪** | 实时导出状态、统计信息与日志 |

### 架构

```
React + TypeScript（界面）
        ↕ IPC
Rust / Tauri（认证、配置、文件写入、任务编排）
        ↕ stdio JSON
Python Sidecar（Confluence API + confluence-markdown-exporter 转换）
```

### 环境要求

- **Node.js** 18+
- **Rust** 工具链（[rustup](https://rustup.rs/)）
- **uv**（Python 包管理器）— macOS/Linux 下 setup 脚本可自动安装
- **Python** 3.10+（由 uv 管理）

macOS 开发环境还需 Xcode Command Line Tools（`xcode-select --install`）。

### 快速开始

```bash
# 安装依赖（Node、Python sidecar、开发 shim）
npm run setup

# 开发模式启动
npm start
```

### 构建

```bash
# 先构建 Python sidecar，再打包桌面应用
npm run build:mvp
```

其他常用命令：

| 命令 | 说明 |
|------|------|
| `npm test` | 运行前端单元测试 |
| `npm run test:sidecar` | 运行 Python sidecar 测试 |
| `npm run build:frontend` | 仅构建 Web 前端 |
| `npm run icon` | 从 `src-tauri/icons/icon-source.png` 重新生成应用图标 |

### 使用流程

1. **登录** — 填写 Confluence 地址，通过 SSO、API 令牌或 Cookie 完成认证。
2. **浏览** — 选择空间、搜索页面，或粘贴 Confluence 页面 URL。
3. **选择** — 勾选需要导出的页面。
4. **导出** — 设置输出目录、格式与附件选项，开始导出。
5. **设置** — 配置跳过未变更页面、后台同步、语言与主题等。

### 认证说明

- **SSO**：打开安全登录窗口完成 IdP 登录；检测到 Wiki 会话后自动连接。
- **API 令牌**：使用 Atlassian 账号邮箱及在账户安全设置中生成的 API Token。
- **会话 Cookie**：在浏览器登录 Confluence 后，从 DevTools 复制完整 Cookie（需包含 `seraph.confluence`，不能只有 `JSESSIONID`）。

凭证仅保存在本机。

### 许可证

[MIT](LICENSE)
