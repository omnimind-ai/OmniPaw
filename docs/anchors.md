# 关键文件落点

> 本页只声明责任归属。文件内部结构和调用步骤以代码与对应专题约束为准。

## Electron 与跨进程边界

| 职责 | 权威落点 |
|------|----------|
| 应用启动编排 | `electron/main.ts` |
| core 初始化与依赖装配 | `electron/core-runtime.ts` |
| 主窗口 | `electron/main-window.ts` |
| 托盘 | `electron/tray.ts` |
| 快捷键 | `electron/shortcut-controller.ts` |
| IPC 总入口 | `electron/ipc/index.ts` |
| IPC domain handler | `electron/ipc/<domain>.ts` |
| IPC 注册公共边界 | `electron/ipc/common.ts`、`electron/ipc/types.ts` |
| preload bridge | `electron/preload.ts` |
| Electron 日志适配 | `electron/logging/electron-log-adapter.ts` |
| OmniInfer 平台适配 | `electron/omniinfer/` |
| 桌宠 Electron controller | `packages/desktop-pet/electron/controller.ts` |
| Electron 构建入口 | `electron.vite.config.ts` |

## Shared 契约

| 职责 | 权威落点 |
|------|----------|
| IPC channel | `shared/constants.ts` |
| 完整 bridge 契约 | `shared/types/bridge.ts` |
| 业务 payload | `shared/types/` |
| 跨层日志清洗 | `shared/logging/` |

## Renderer

| 职责 | 权威落点 |
|------|----------|
| 应用入口 | `src/main.ts` |
| 根组件 | `src/App.vue` |
| 路由 | `src/router/index.ts` |
| 聊天工作区壳层 | `src/components/chat/ChatWorkspace.vue` |
| 聊天首页 | `src/views/ChatHomeView.vue` |
| 聊天内容页 | `src/views/ChatContentView.vue` |
| 聊天组件 | `src/components/chat/` |
| 聊天编排 composables | `src/composables/chat/` |
| 设置页 | `src/views/SettingsView.vue` |
| 设置组件 | `src/components/settings/` |
| Pinia stores | `src/stores/` |
| renderer bridge 与降级边界 | `src/bridge/app.ts` |
| renderer 全局 bridge 声明 | `src/types/window.d.ts` |
| 国际化 | `src/i18n/` |
| 全局样式与 tokens | `src/styles/main.css` |
| 基础 UI | `src/components/ui/` |

## Desktop pet 包

| 职责 | 权威落点 |
|------|----------|
| 窗口生命周期与专属 IPC | `packages/desktop-pet/electron/` |
| Vite HTML 入口 | `packages/desktop-pet/entries/` |
| 透明视觉层与状态展示 | `packages/desktop-pet/renderer/visual/` |
| 命中层、拖动与文件投递 | `packages/desktop-pet/renderer/input/` |
| 桌宠面板 | `packages/desktop-pet/renderer/panel/` |
| 桌宠气泡 | `packages/desktop-pet/renderer/bubble/` |
| 桌宠共享契约 | `shared/types/cat.ts`、`shared/types/cat-pet.ts`、`shared/types/cat-appearance.ts` |
| 桌宠业务状态 | `core/db/repos/cat-pet-repo.ts`、`core/role/` |

## Core

| 职责 | 权威落点 |
|------|----------|
| 聊天 | `core/chat/` |
| Agent 与工具 | `core/agent/` |
| Provider | `core/provider/` |
| OmniInfer 业务服务 | `core/omniinfer/` |
| 配置 | `core/config/` |
| 数据库与 repo | `core/db/` |
| MCP | `core/mcp/` |
| Skill | `core/skill/` |
| Cron | `core/cron/` |
| Memory | `core/memory/` |
| Observation | `core/observation/` |
| Companion role 与形象 | `core/role/` |
| 平台无关日志 | `core/logging/` |
| 数据路径 | `core/utils/data-paths.ts` |

## 验证

| 职责 | 权威落点 |
|------|----------|
| npm scripts | `package.json` |
| smoke 总入口 | `scripts/run-smoke-tests.mjs` |
| Electron Node 运行器 | `scripts/run-electron-node.mjs` |
| smoke 用例 | `tests/smoke/` |
| 浏览器行为验证 | `tests/`、`playwright.config.js` |
