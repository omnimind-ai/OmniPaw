# 关键文件落点

## Electron 与 IPC

| 职责 | 路径 |
|------|------|
| Electron 应用启动编排 | `electron/main.ts` |
| core 初始化和依赖装配 | `electron/core-runtime.ts` |
| 主窗口 controller | `electron/main-window.ts` |
| 托盘 controller | `electron/tray.ts` |
| IPC 注册入口 | `electron/ipc/index.ts` |
| IPC 共享注册工具 | `electron/ipc/common.ts` |
| IPC 注册依赖类型 | `electron/ipc/types.ts` |
| IPC domain handler | `electron/ipc/<domain>.ts` |
| Persona IPC | `electron/ipc/persona.ts` |
| Workspace IPC | `electron/ipc/workspace.ts` |
| Terminal process IPC | `electron/ipc/terminal-process.ts` |
| 猫窗口和窗口专属 IPC | `electron/cat-window.ts` |
| contextBridge 暴露、ipcRenderer 调用、事件订阅包装 | `electron/preload.ts` |
| IPC channel 常量 | `shared/constants.ts` |
| bridge 契约类型 | `shared/types/bridge.ts` |
| renderer bridge 与 fallback bridge | `src/bridge/app.ts` |
| window 类型声明 | `src/types/window.d.ts` |
| electron-vite 配置 | `electron.vite.config.ts` |

## Renderer

| 职责 | 路径 |
|------|------|
| Vue 入口、Pinia、Router、全局错误提示 | `src/main.ts` |
| 根组件与全局 Toaster | `src/App.vue` |
| 路由注册 | `src/router/index.ts` |
| 聊天页面编排 | `src/views/ChatHomeView.vue` |
| 设置页面编排与自动保存 | `src/views/SettingsView.vue` |
| 占位重写页面 | `src/views/RewritePlaceholderView.vue` |
| 聊天侧栏 | `src/components/ChatSidebar.vue` |
| 聊天输入区 | `src/components/ChatComposer.vue` |
| 设置页组件 | `src/components/settings/` |
| Provider 设置子组件 | `src/components/settings/provider-settings/` |
| Provider 删除确认弹窗 | `src/components/settings/provider-settings/ProviderDeleteModal.vue` |
| Persona 设置 | `src/components/settings/PersonaSettingsForm.vue` |
| 本地 Agent 设置 | `src/components/settings/LocalAgentSettingsForm.vue` |
| shadcn-vue 组件 | `src/components/ui/` |
| 聊天 composables | `src/composables/useSessions.ts`、`src/composables/useMessages.ts`、`src/composables/useMediaHandling.ts` |
| Pinia stores | `src/stores/` |
| Provider 设置草稿与自动保存 | `src/composables/useProviderDraft.ts`、`src/composables/useProviderAutosave.ts` |
| 全局样式与 Tailwind v4 tokens | `src/styles/main.css` |
| class 合并工具 | `src/lib/utils.ts` |
| toast 封装 | `src/utils/toast.ts` |

## Core

| 职责 | 路径 |
|------|------|
| 聊天服务入口 | `core/chat/chat-service.ts` |
| 上下文构建 | `core/chat/context-manager.ts` |
| 运行状态与 stream event | `core/chat/run-manager.ts` |
| 附件上传、预览、文本提取 | `core/chat/attachment-service.ts` |
| Agent 运行入口 | `core/agent/agent-runner.ts` |
| Agent step engine | `core/agent/step-engine.ts` |
| Agent run 支撑模块 | `core/agent/run/` |
| 工具调用循环 | `core/agent/tool-loop.ts` |
| 工具注册 | `core/agent/tools/registry.ts` |
| 内置工具定义 | `core/agent/tools/builtin-tools.ts` |
| 工具执行与超时 | `core/agent/tools/executor.ts` |
| 工具策略 | `core/agent/tools/policy.ts` |
| Agent workspace | `core/agent/workspace/service.ts` |
| Terminal service | `core/agent/terminal/terminal-service.ts` |
| Process supervisor | `core/agent/terminal/process-supervisor.ts` |
| Provider 管理 | `core/provider/manager.ts` |
| Provider registry schema | `core/provider/registry-schema.ts` |
| Provider registry store | `core/provider/registry-store.ts` |
| Provider 抽象 | `core/provider/base-provider.ts` |
| OpenAI 兼容 Provider | `core/provider/providers/openai.ts` |
| Provider 凭据解析 | `core/provider/credentials.ts` |
| Provider 错误归一化 | `core/provider/errors.ts` |
| Persona 管理 | `core/persona/manager.ts` |
| Persona registry schema | `core/persona/registry-schema.ts` |
| Persona registry store | `core/persona/registry-store.ts` |
| Skill 管理 | `core/skill/skill-manager.ts` |
| Cron 管理 | `core/cron/cron-manager.ts` |

## 配置与数据

| 职责 | 路径 |
|------|------|
| 配置默认值、迁移、校验、序列化 | `core/config/schema.ts` |
| 配置文件读写、备份、原子写入 | `core/config/store.ts` |
| 统一数据根与路径解析 | `core/utils/data-paths.ts` |
| 工具开关配置适配 | `core/config/tool-settings-store.ts` |
| 设置共享类型 | `shared/types/settings.ts` |
| Provider 共享类型 | `shared/types/provider.ts` |
| Chat 共享类型 | `shared/types/chat.ts` |
| Persona 共享类型 | `shared/types/persona.ts` |
| 本地 Agent 共享类型 | `shared/types/local-agent.ts` |
| 数据库连接和 migration 执行 | `core/db/client.ts` |
| migration 列表 | `core/db/migrations.ts` |
| repo 目录 | `core/db/repos/` |
| JSON 编解码 | `core/db/json.ts` |
| 初始数据种子 | `core/db/seed.ts` |

## 脚本与验证

| 职责 | 路径 |
|------|------|
| npm 脚本 | `package.json` |
| Electron native rebuild | `scripts/rebuild-electron-native.mjs` |
| Electron Node 脚本运行器 | `scripts/run-electron-node.mjs` |
| 配置 smoke | `scripts/settings-config-smoke.ts` |
| Provider registry smoke | `scripts/provider-registry-smoke.ts` |
| Persona registry smoke | `scripts/persona-registry-smoke.ts` |
| 数据库 smoke | `scripts/db-smoke.ts` |
| 聊天 core smoke | `scripts/chat-core-smoke.ts` |
| Agent runtime smoke | `scripts/agent-runtime-smoke.ts` |
| Tool management smoke | `scripts/tool-management-smoke.ts` |
| Local agent smoke | `scripts/local-agent-smoke.ts` |
| Playwright 配置 | `playwright.config.js` |
