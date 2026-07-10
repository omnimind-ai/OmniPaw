# Core 约束

## Core 边界

- MUST：`core/` 只承载平台无关的业务、持久化和 Node 侧服务。
- MUST NOT：`core/` 导入 `electron`、`electron-log`、BrowserWindow、WebContents 或其他 Electron transport 类型。
- MUST NOT：renderer 或 preload 导入 `@core/*`。
- MUST：Electron 平台能力通过 `electron/` 中的 adapter/controller 以接口形式注入 core。
- MUST：跨层公开类型来自 `shared/types/*`，不得在 core 中复制 renderer/main 契约。
- MUST：数据库、文件、Provider 网络、附件、workspace、terminal 和进程管理仅在 main/core 侧发生。
- MUST：用户数据路径通过统一数据路径边界解析，不得在业务域散落硬编码路径。

## 初始化与依赖

- MUST：core 依赖由 `electron/core-runtime.ts` 统一装配，`electron/main.ts` 只持有启动和平台生命周期编排。
- MUST：IPC 通过 `CoreRuntime` 暴露 core 能力，窗口专属平台能力通过对应 controller 暴露。
- MUST：service/manager 承担业务流程，repo 承担持久化映射；repo 不作跨域业务决策。
- MUST：跨域依赖通过构造或显式工厂注入，不得在业务方法中隐式创建全局 service。
- SHOULD：依赖方向保持单向，公共能力优先下沉为平台无关接口或纯函数。

## 错误、日志与秘密

- MUST：Provider、配置和其他可恢复错误保留稳定的结构化 code 与恢复语义。
- MUST：日志使用项目 logger；`electron-log` 仅允许出现在 `electron/logging/` 的平台适配层。
- MUST：core logger 和 sink 接口保持平台无关，并通过依赖注入进入业务边界。
- MUST：日志在写入前完成脱敏和截断；sink 失败不得改变业务结果。
- MUST NOT：日志、错误或快照记录 prompt、角色文本、消息正文、附件正文、工具参数/结果、Provider 回包、凭据、terminal env 或 MCP 原始 env/header。
- SHOULD：日志只保留追踪 id、状态、耗时、错误 code 和恢复/fallback 信息。

## 配置

- MUST：桌面设置、Provider registry、MCP registry 和工具开关保持各自权威存储，不得重新混合为一个隐式配置源。
- MUST：`DesktopSettingsConfig` 是桌面设置的完整契约；Provider 运行态不从已废弃的桌面 settings provider 字段或数据库表恢复。
- MUST：配置读写保持校验、规范化、版本拒绝、备份、原子替换和 clone 语义。
- MUST：新增或修改配置字段时，shared 类型、schema 默认与兼容语义、持久化、store、UI 和测试必须同步。
- MUST：Provider registry 的 source、model、默认/fallback 引用和 credential 处理由 Provider 边界统一维护。
- MUST：删除 Provider source/model 时清理所有失效引用，不得留下悬空默认模型、fallback 或 session override。
- MUST：凭据不得进入 registry 的 renderer 可见结果或日志。
- MUST：配置中存在 Provider preset 不代表 Provider 已具备执行能力。
- MUST：工具开关的配置、管理服务、工具可见性和 renderer 状态保持一致。

## 数据路径

- MUST：Electron 业务数据从统一 OmniPaw 数据根派生。
- MUST：配置、数据库、日志、skills、附件、形象包和 agent workspace 使用统一 resolver 提供的子路径。
- MUST：路径迁移必须显式、可验证且保护现有数据；不得静默读取多个来源后产生不确定优先级。

## 数据库

- MUST：数据库连接、初始化和 migration 由 `core/db/` 统一管理。
- MUST：保持外键完整性、并发读写和失败恢复语义。
- MUST：任何 schema 变更都追加新的、单调递增且可重复安全检查的 migration；不得改写已发布 migration 的语义。
- MUST：schema、repo 映射和 shared/domain 类型同步变化。
- MUST：repo 返回 domain/shared 类型，不向 service 或 renderer 泄露裸数据库 row。
- MUST：SQL 不得散落在 renderer、IPC handler 或业务 service。
- MUST：JSON 和时间字段沿用统一编码语义，多步写操作保持事务一致性。
- MUST：已有软删除、级联和引用清理语义不得被无关变更改变。
- SHOULD：查询和索引变更必须以真实访问模式和 migration 可验证性为依据。

## 权威落点

| 职责 | 路径 |
|------|------|
| core 装配 | `electron/core-runtime.ts` |
| 聊天 | `core/chat/` |
| Agent 与工具 | `core/agent/` |
| Provider | `core/provider/` |
| 配置 | `core/config/` |
| 数据库 | `core/db/` |
| 平台无关日志 | `core/logging/` |
| Electron 日志适配 | `electron/logging/` |
| 数据路径 | `core/utils/data-paths.ts` |
| 共享类型 | `shared/types/` |

## 自检约束

- [ ] core 没有 Electron 依赖，renderer/preload 没有 core 依赖。
- [ ] 新能力沿 runtime 注入链路进入，没有隐藏全局依赖。
- [ ] 配置或 Provider 变更同步了全部权威存储和消费者。
- [ ] schema 变更有新 migration，repo 与 shared 类型一致。
- [ ] 错误和日志未扩大秘密信息暴露面。
- [ ] 相关架构、配置、数据库或领域 smoke 已通过。
