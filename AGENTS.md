# OpenOmniClaw Electron Agent 地图

> 这是一份定位地图，不是手册。先读这里，再按任务类型跳到专题文档。

## 项目概况

Electron 桌面客户端。

- 主进程：`electron/`
- 业务核心：`core/`
- 跨进程契约：`shared/`
- Vue renderer：`src/`
- 构建：electron-vite + Vue 3 + TypeScript + Pinia + shadcn-vue + Tailwind v4
- 数据：better-sqlite3 + 本地 JSON 配置

`AstrBot/`、`OpenOmniClaw/` 是参考资料或外部项目快照，不是当前项目的默认修改落点。

## 关键词优先级

- **MUST**：必须遵守，违反即视为实现不合格
- **SHOULD**：默认做法，有明确原因可偏离，交付时说明
- **MAY**：允许选项

当本文档与用户明确需求冲突时，以用户需求为准。

---

## 核心约束

1. **先定位再改动**：新增路由、IPC、配置字段、DB 字段、工具或 Provider 前，先搜现有落点。
2. **复用现有边界**：renderer 通过 `appBridge` 访问能力；main 通过 `core/` 服务和 manager 执行业务；跨层类型放 `shared/types/`。
3. **同步跨文件契约**：IPC、配置、数据库 schema、聊天消息结构、Provider 能力变更都必须同步相关类型、实现和调用点。
4. **不改参考项目**：除非用户点名，不能把变更写进 `AstrBot/`、`OpenOmniClaw/`、`example/`。
5. **最小可行改动**：优先沿用当前目录的写法，不顺手重构、格式化或迁移无关代码。
6. **保护安全边界**：renderer 不直接访问 Node、Electron 主进程对象、数据库或文件系统。

## 何时必须问用户

仅以下情况追问，否则按最简单解释执行：

- 需要破坏性数据迁移、删除用户数据或改变配置兼容策略
- 需要新增依赖、替换 UI 基础库、调整构建链路或大改目录结构
- UI 入口位置、默认行为或自动保存策略存在多种合理方案且会影响长期使用习惯
- 需要修改参考项目目录或引入参考项目代码
- 需要保存、展示或传递新的敏感信息

## 快速落点

详见 [docs/anchors.md](docs/anchors.md)。

| 类型 | 文件 |
|------|------|
| Electron main 启动编排 | `electron/main.ts` |
| IPC 注册入口 | `electron/ipc/index.ts` |
| IPC domain handler | `electron/ipc/<domain>.ts` |
| preload bridge | `electron/preload.ts` |
| renderer bridge 包装 | `src/bridge/app.ts` |
| IPC channel | `shared/constants.ts` |
| bridge 类型 | `shared/types/bridge.ts` |
| Vue 路由 | `src/router/index.ts` |
| 设置状态 | `src/stores/settings.ts` |
| Provider 状态 | `src/stores/provider.ts` |
| 聊天页面 | `src/views/ChatHomeView.vue` |
| 设置页面 | `src/views/SettingsView.vue` |
| core 初始化 | `electron/core-runtime.ts` |
| 数据库迁移 | `core/db/migrations.ts` |
| 配置 schema | `core/config/schema.ts` |
| OmniInfer 进程监管 | `electron/omniinfer/process.ts` |
| OmniInfer 控制面服务 | `core/omniinfer/runtime-service.ts` |
| OmniInfer provider | `core/provider/providers/omniinfer.ts` |
| OmniInfer 设置 UI（"模型服务"→ omniinfer-local provider 的"基础配置" tab） | `src/components/settings/provider-settings/ProviderOmniInferBasicTab.vue` |

## 渐进式披露阅读顺序

1. 先读本文件，确定任务域和默认落点。
2. 不确定文件位置：读 [docs/anchors.md](docs/anchors.md)。
3. 涉及 Vue、Pinia、shadcn-vue、页面或样式：读 [docs/frontend.md](docs/frontend.md)。
4. 涉及 IPC、preload、Electron 窗口或跨进程 API：读 [docs/electron-ipc.md](docs/electron-ipc.md)。
5. 涉及 core service、manager、repo 依赖关系：读 [docs/core.md](docs/core.md)。
6. 涉及设置页草稿、Provider 设置 UI：读 [docs/frontend.md](docs/frontend.md) 的设置专题。
7. 涉及配置文件、Provider 配置持久化、工具开关、SQLite、repo、schema 或 migration：读 [docs/core.md](docs/core.md) 的配置/数据库专题。
8. 涉及聊天、Provider 执行、agent、tool、skill、cron、附件或流式事件：读 [docs/chat-provider-agent.md](docs/chat-provider-agent.md)。
9. 交付前：读 [docs/workflow.md](docs/workflow.md)。

## 专题文档索引

| 任务类型 | 读取文档 |
|----------|----------|
| 文件落点不清楚 | [docs/anchors.md](docs/anchors.md) |
| 前端页面、组件、样式、Pinia | [docs/frontend.md](docs/frontend.md) |
| Electron main / preload / IPC | [docs/electron-ipc.md](docs/electron-ipc.md) |
| core 层服务、配置、数据库、repo、migration | [docs/core.md](docs/core.md) |
| 设置页、Provider 设置 UI、autosave | [docs/frontend.md](docs/frontend.md) |
| 聊天、Provider、Agent、工具、附件 | [docs/chat-provider-agent.md](docs/chat-provider-agent.md) |
| 验证与交付自检 | [docs/workflow.md](docs/workflow.md) |

## 交付要求

- 常规 TypeScript / Vue 变更：优先运行 `pnpm typecheck`。
- 影响 main/preload/打包链路：运行 `pnpm build`。
- 影响数据库、配置、聊天 core、agent/tool：按 [docs/workflow.md](docs/workflow.md) 选择对应 smoke script。
