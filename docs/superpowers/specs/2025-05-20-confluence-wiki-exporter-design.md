---
name: confluence-wiki-exporter
description: Electron application for exporting Confluence Wiki content to Markdown/HTML
type: project
---

# Confluence Wiki Exporter - 设计文档

**日期**：2025-05-20
**状态**：架子搭建阶段（功能实现后续迭代）

---

## 背景

用户需要构建一个 Electron 桌面应用，用于导出内网 Confluence Wiki 内容。支持灵活的导出范围（指定空间/页面）和多种导出格式（Markdown、HTML）。认证方式支持 API Token、Cookie、账户密码三种。

**当前任务范围**：只搭建项目架子（脚手架），具体功能实现（UI、导出逻辑）将在后续任务中完成。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron |
| 构建 | electron-vite |
| 前端 | React + TypeScript |
| 状态管理 | Zustand（预留，暂不实现） |

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     主进程 (Main Process)                    │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐   │
│  │窗口管理 │ │IPC 通信 │ │文件操作 │ │ 导出任务调度    │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────────────┘   │
│  ┌─────────┐ ┌─────────┐                                     │
│  │断点续传 │ │定时任务 │ （骨架，暂不实现）                  │
│  └─────────┘ └─────────┘                                     │
└─────────────────────────────────────────────────────────────┘
                              ↑ IPC
┌─────────────────────────────────────────────────────────────┐
│                   渲染进程 (React + TypeScript)              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐   │
│  │认证界面 │ │空间选择 │ │进度显示 │ │ 导出格式配置    │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────────────┘   │
│  ┌─────────┐ ┌─────────┐                                     │
│  │预览面板 │ │设置面板 │ （骨架，暂不实现）                  │
│  └─────────┘ └─────────┘                                     │
└─────────────────────────────────────────────────────────────┘
                              ↓ API
┌─────────────────────────────────────────────────────────────┐
│                    Confluence REST API                       │
│  （骨架定义，暂不实现调用逻辑）                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 项目结构

```
export-wiki/
├── electron/                    # 主进程
│   ├── main.ts                  # 窗口创建、应用生命周期
│   ├── preload.ts               # IPC API 暴露
│   └── ipc/                     # IPC 通道定义骨架
│       ├── index.ts             # IPC 注册入口
│       ├── auth.ts              # 认证 IPC（空实现）
│       ├── export.ts            # 导出 IPC（空实现）
│       └── config.ts            # 配置 IPC（空实现）
│
├── src/                         # 渲染进程
│   ├── App.tsx                  # 根组件
│   ├── main.tsx                 # React 入口
│   ├── components/              # 组件骨架
│   ├── hooks/                   # 自定义 hooks（空）
│   ├── stores/                  # 状态管理（空）
│   └── styles/index.css         # 基础样式
│
├── electron.vite.config.ts      # 构建配置
├── package.json                 # 项目配置
├── tsconfig.json                # TS 配置（渲染进程）
├── tsconfig.node.json           # TS 配置（主进程）
└── .gitignore                   # Git 忽略
```

---

## IPC 通道设计（骨架）

| 通道 | 方向 | 用途 |
|------|------|------|
| `auth:configure` | renderer → main | 配置认证（空） |
| `auth:test` | renderer → main | 测试连接（空） |
| `export:getSpaces` | renderer → main | 获取空间列表（空） |
| `export:getPages` | renderer → main | 获取页面列表（空） |
| `export:start` | renderer → main | 开始导出（空） |
| `export:progress` | main → renderer | 进度通知（空） |
| `config:save` | renderer → main | 保存配置（空） |
| `config:load` | renderer → main | 加载配置（空） |

---

## 验证标准

1. `npm run dev` 正常启动 Electron 窗口
2. 窗口显示 React 应用基础页面
3. TypeScript 编译无错误
4. `window.electronAPI` 可调用（返回占位值）
5. `npm run build` 生成可执行文件

---

## 后续迭代范围（不在当前任务）

- Confluence REST API 调用实现
- Markdown/HTML 转换逻辑
- 认证逻辑（Token/Cookie/密码）
- UI 组件完整实现
- 断点续传、进度追踪
- 状态管理实现
- 单元测试