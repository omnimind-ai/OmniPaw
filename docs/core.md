# Core 规范

## 建议阅读顺序

按需展开，不要把本页当成必须逐字读完的手册：

1. 只改 main/core 依赖关系：先读 `Core 边界`、`依赖注入与初始化`
2. 涉及配置文件、Provider 配置、工具开关：再读 `配置`
3. 涉及本地 workspace、terminal：再读 `配置`
4. 涉及 SQLite、repo、migration：再读 `数据库`
5. 涉及聊天、Provider、Agent、工具：再读 [chat-provider-agent.md](chat-provider-agent.md)

---

## Core 边界

- MUST：`core/` 是主进程业务核心，只能由 Electron main 侧 runtime、smoke script 等 Node 环境调用。
- MUST NOT：renderer 或 preload 直接导入 `@core/*`。
- MUST：跨层类型来自 `shared/types/*`，不要在 core 内定义另一套对外契约。
- MUST：DB、文件、Provider 网络请求、附件读写只在 main/core 侧发生。
- MUST：本地 workspace、terminal、进程管理只在 main/core 侧发生，renderer 只能通过 bridge 请求受限能力。
- MUST：对用户数据路径使用 `core/utils/data-paths.ts` 的统一 resolver，不散落硬编码路径。
- SHOULD：让 core 代码可被 smoke script 在 Electron Node 环境中运行。

## 依赖注入与初始化

- MUST：在 `electron/core-runtime.ts` 统一初始化 core 依赖，`electron/main.ts` 只负责启动编排。
- MUST：core 能力通过 `CoreRuntime` 注入 `electron/ipc/<domain>.ts` 的 IPC handler 暴露。
- MUST：保持 service / manager / repo 分层；service/manager 承担业务流程，repo 只处理持久化映射。
- MUST：通过构造函数注入依赖，不在业务方法中临时 new 另一个跨域 service。
- SHOULD：保持 `electron/ipc/<domain>.ts` 的 handler 薄，参数归一化后交给 core。
- SHOULD：让 manager 负责跨配置和运行时状态协调，repo 不处理业务决策。
- SHOULD：避免循环依赖；需要共享能力时抽出更小 service 或纯函数。

## 错误与秘密信息

- MUST：Provider 错误使用 `normalizeProviderError` 归一化。
- MUST：配置错误返回结构化 `SettingsOperationError`。
- MUST：对秘密信息做脱敏处理，不在错误、日志、IPC payload 中泄露 API key。
- SHOULD：对可恢复错误保留 retryable 或 recoverable 信息。

## 日志与可观测性

- MUST：core / main 统一通过项目 logger 输出结构化日志，不直接使用 `console.*` 作为业务日志通道；`electron-log` 只允许出现在日志适配层。
- MUST：logger 通过构造函数注入到 service / manager / repo 边界，子域通过 `child()` 派生 scope，不在业务方法里临时 new 另一个 logger。
- MUST：日志只保留 id、status、duration、error code/message、retryable/recoverable、fallback reason 等结构化字段，不记录 prompt、system prompt、role prompt、mask text、附件正文、Provider 响应体、API key、凭据、terminal env 或 MCP 原始 env/header。
- MUST：日志写入前必须经过现有脱敏和截断流程，sink 失败不得影响主流程，只能降级为丢弃或失败计数。
- SHOULD：诊断信息优先写入 scope 和 context，避免把长文本 stack 或自由文本拼成不可检索字段。

---

## 配置

配置主落点是 `core/config/`，renderer 侧草稿与表单约束见 [frontend.md](frontend.md)。

### 数据根

- MUST：Electron 业务数据统一从 `<appData>/omnipaw/` 派生，路径解析集中在 `core/utils/data-paths.ts`。
- MUST：配置、Provider registry 和 MCP registry 位于统一数据根的 `config/` 子目录；SQLite、skill state、skills、附件、agent workspace 和业务日志位于同一数据根下的各自子路径。
- SHOULD：内部开发阶段以当前统一数据根为唯一真实来源，不做旧路径隐式迁移。

### 配置对象

- MUST：以 `DesktopSettingsConfig` 作为桌面配置的唯一完整对象。
- MUST：保存完整配置对象，不写散落的局部配置文件。
- MUST：通过 `ConfigStore` 读写配置，保持备份、原子写入、错误状态和 clone 语义。
- MUST：配置版本由 `CURRENT_SETTINGS_VERSION` 管理；不允许静默接受未来版本。
- SHOULD：新增字段提供向后兼容 normalize 行为，让旧配置自动补齐默认值。

### 配置字段变更

新增或修改配置字段时：

- MUST：同步更新 `shared/types/settings.ts`。
- MUST：同步更新 `core/config/schema.ts` 的默认值、normalize、validate、serialize 兼容逻辑。
- MUST：同步更新 `src/bridge/app.ts` 的 bridge 配置类型。
- MUST：同步更新 `src/stores/settings.ts` 和相关设置 UI。

### Provider 配置

- MUST：Provider 配置来源于独立 Provider registry 文件（默认 `providers.json`），不从桌面配置 `DesktopSettingsConfig.providers` 读取运行时 Provider 状态，也不重新引入数据库 Provider 表。
- MUST：通过 `core/provider/registry-store.ts` 读写 Provider registry，保持备份、原子写入、错误状态和 clone 语义。
- MUST：Provider registry 默认是空 sources、空 models、无默认模型；不要在配置默认值里创建空占位 Provider。
- MUST：默认模型和 fallback 模型只能通过 Provider registry 的显式设置操作写入，保存 source/model 或刷新模型不能隐式写默认模型。
- MUST：删除 Provider source/model 时在 core 侧集中清理 registry default、fallback refs 和 chat session overrides，并向 renderer 返回建议的 next selection。
- MUST：保存 Provider 时处理 credential，不把 API key 回显到 renderer 的 provider registry、provider 列表或日志中。
- MUST：认清 Provider 配置与 Provider 执行实现不是一回事；新增 preset 不代表该 Provider 已可执行。
- SHOULD：Provider 模型、能力、compat 字段保持 registry、shared type、UI 三侧命名一致。

### 工具开关配置

- MUST：工具开关通过 `tools.enabledByName` 管理。
- MUST：保持 `ToolManagementService` 与 `ConfigToolSettingsStore` 的同步。
- SHOULD：工具开关保存后广播 settings changed 事件，保证 renderer 状态可刷新。

---

## 数据库

数据库主落点是 `core/db/`。当前使用 SQLite + better-sqlite3。

### 连接

- MUST：使用 `DatabaseClient` 统一连接数据库。
- MUST：保持 `foreign_keys = ON`、`journal_mode = WAL`、`busy_timeout = 5000` 初始化行为。
- MUST：Electron 环境数据库路径保持在统一数据根下的 `omnipaw.sqlite3`。

### Schema 与 Migration

任何 schema 变更都必须通过 migration 管理。

变更 Playbook：

1. 在 `core/db/migrations.ts` 追加 migration。
2. migration id 单调递增，不复用旧 id。
3. migration SQL 必须幂等，空库和已有库都能跑通。
4. 新表、新列、新索引同步 repo 映射和 shared 类型。
5. 运行 `node scripts/run-electron-node.mjs tests/smoke/db-smoke.ts` 和 typecheck。

约束：

- MUST：migration 由 `runMigrations` 在事务中应用。
- MUST NOT：修改已发布 migration 的语义。
- MUST NOT：重新引入已迁出到配置文件的 Provider/app settings 数据库表。
- SHOULD：对高频查询补索引，并在 migration 中创建。
- SHOULD：对回填 migration 明确重复执行时的行为。

### Repo

- MUST：repo 负责表字段和 domain 类型之间的映射，不把 SQL 散落到 service 或 renderer。
- MUST：repo 返回 shared/domain 类型，不返回裸 row。
- MUST：JSON 字段通过 `core/db/json.ts` 的 encode/decode 语义处理。
- MUST：时间字段继续使用 Unix ms number，保持 shared 类型一致。
- MUST：用户删除会话时遵守当前软删除语义，除非用户明确要求物理删除。
- SHOULD：repo 方法使用 prepared statement 和命名参数。
- SHOULD：多步写操作使用 better-sqlite3 transaction。
- SHOULD：保持 DB 类型由 `core/db/types.ts` 转发 shared 类型，避免 core/db 独立分叉。

---

## 常见落点

| 职责 | 路径 |
|------|------|
| 初始化和依赖装配 | `electron/core-runtime.ts` |
| main 启动编排 | `electron/main.ts` |
| IPC handler | `electron/ipc/<domain>.ts` |
| 聊天业务 | `core/chat/` |
| Agent 和工具 | `core/agent/` |
| Provider | `core/provider/` |
| 配置 schema | `core/config/schema.ts` |
| 配置读写 | `core/config/store.ts` |
| 工具配置适配 | `core/config/tool-settings-store.ts` |
| 本地 workspace | `core/agent/workspace/service.ts` |
| terminal service | `core/agent/terminal/terminal-service.ts` |
| process supervisor | `core/agent/terminal/process-supervisor.ts` |
| 本地 Agent 共享类型 | `shared/types/local-agent.ts` |
| 数据库连接 | `core/db/client.ts` |
| Migration | `core/db/migrations.ts` |
| Repo | `core/db/repos/` |
| 共享类型 | `shared/types/` |

## 自检清单

- [ ] renderer 没有导入 core。
- [ ] 业务逻辑没有堆进 preload。
- [ ] 新能力通过 shared 类型跨层。
- [ ] 依赖从 `electron/core-runtime.ts` 初始化链路进入。
- [ ] 配置字段变更同步了 shared type、默认值、normalize、validate、UI/store。
- [ ] workspace/terminal 变更保持 main/core 边界和 profile/approval 语义。
- [ ] schema 变更有新 migration，repo 映射和 shared 类型已同步。
- [ ] smoke script 可覆盖的路径已运行或说明未运行原因。
