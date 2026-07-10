# OmniPaw Electron Agent 地图

> 这是一份定位地图，只描述长期边界、变更约束和文档入口，不记录具体实现步骤。

## 项目边界

- Electron 主进程与平台适配：`electron/`
- 平台无关业务核心：`core/`
- 跨进程契约：`shared/`
- Vue renderer：`src/`
- 跨进程功能包：`packages/`，当前包含桌宠包 `packages/desktop-pet/`
- 构建：electron-vite + Vue 3 + TypeScript + Pinia + shadcn-vue + Tailwind v4
- 数据：better-sqlite3 + 本地 JSON 配置

被标记为参考项目、外部快照或本地素材工作区的目录不属于默认修改范围。

## 关键词

- **MUST**：必须满足的边界或不变量
- **SHOULD**：默认约束；偏离时必须有明确理由
- **MAY**：允许但不要求

用户明确需求高于本文档；安全边界和数据保护要求除非被用户明确、合法地重新授权，否则不得放宽。

## 核心约束

1. **先定位再改动**：新增路由、IPC、配置、数据库字段、工具、Provider 或窗口能力前，MUST 先确认现有责任边界和调用方。
2. **保持分层**：renderer MUST 通过 `appBridge` 请求主进程能力；Electron 层 MUST 通过 runtime 调用 core；跨层类型 MUST 由 `shared/` 提供。
3. **保持单一契约**：IPC、配置、数据库、聊天消息、Provider 和桌宠状态发生变化时，MUST 同步所有生产者、消费者和验证边界，不得复制第二套完整契约。
4. **保护平台边界**：`core/` MUST NOT 依赖 Electron；renderer MUST NOT 直接依赖 Node、Electron、数据库或文件系统。
5. **保护功能包边界**：桌宠的窗口、入口和专属 renderer MUST 留在 `packages/desktop-pet/`；通用业务能力仍归属 `core/`，跨进程契约仍归属 `shared/`。
6. **限制变更范围**：MUST 保留用户已有改动，不修改无关文件，不把变更写入参考项目或外部快照。

## 必须向用户确认的情况

仅在下列情况中止并确认；其他情况按最小、可逆且符合现有边界的解释执行：

- 破坏性迁移、删除用户数据或改变兼容策略
- 新增依赖、替换基础 UI、调整构建链路或大改目录边界
- 多种长期行为都合理，且选择会改变用户习惯或产品语义
- 必须修改参考项目、外部快照或引入其中代码
- 新增敏感信息的保存、展示或传递

## 快速落点

详见 [docs/anchors.md](docs/anchors.md)。

| 职责 | 权威落点 |
|------|----------|
| Electron 启动编排 | `electron/main.ts` |
| core 依赖装配 | `electron/core-runtime.ts` |
| IPC 注册 | `electron/ipc/` |
| preload bridge | `electron/preload.ts` |
| renderer bridge | `src/bridge/app.ts` |
| IPC channel | `shared/constants.ts` |
| bridge 契约 | `shared/types/bridge.ts` |
| Vue 路由 | `src/router/index.ts` |
| 聊天工作区 | `src/components/chat/ChatWorkspace.vue` |
| 设置页面 | `src/views/SettingsView.vue` |
| 桌宠功能包 | `packages/desktop-pet/` |
| 数据库迁移 | `core/db/migrations.ts` |
| 配置 schema | `core/config/schema.ts` |
| Provider | `core/provider/` |
| OmniInfer 进程适配 | `electron/omniinfer/` |
| OmniInfer 业务服务 | `core/omniinfer/` |

## 文档路由

- 文件落点不明确：读 [docs/anchors.md](docs/anchors.md)
- Vue、Pinia、页面或样式：读 [docs/frontend.md](docs/frontend.md)
- Electron、IPC、preload 或窗口：读 [docs/electron-ipc.md](docs/electron-ipc.md)
- core、配置、数据库或 repo：读 [docs/core.md](docs/core.md)
- 聊天、Provider、Agent、工具、Skill、Cron 或附件：读 [docs/chat-provider-agent.md](docs/chat-provider-agent.md)
- 桌宠窗口、输入、动效或面板：读 [docs/desktop-pet.md](docs/desktop-pet.md)
- 形象资源包契约：读 [docs/cat-appearance-packs.md](docs/cat-appearance-packs.md)
- 验证与交付：读 [docs/workflow.md](docs/workflow.md)

## 交付约束

- 常规 TypeScript / Vue 变更 SHOULD 通过类型检查。
- main、preload、构建入口或跨进程功能包变更 MUST 通过完整构建。
- 配置、数据库、聊天、Provider、Agent、工具、桌宠和架构边界变更 MUST 运行与风险匹配的 smoke 验证。
- 未运行或无法完成的关键验证 MUST 在交付中明确说明。
