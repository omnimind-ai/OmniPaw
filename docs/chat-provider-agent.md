# 聊天 / Provider / Agent 约束

## 聊天运行

- MUST：聊天会话、消息和 run 的业务入口归属 `ChatService`；IPC、Observation、桌宠和 renderer 不得绕过它直接组合 repo 操作。
- MUST：会话 kind 的创建、复用和校验由聊天服务统一决定；普通聊天新建语义不得与运行态会话复用语义混合。
- MUST：user message、assistant 占位、run 状态和 stream event 在开始、完成、失败与中止路径保持一致。
- MUST：流式事件由 run 边界发出，并可定位到稳定的 session、message 和 run。
- MUST：中止操作可重复安全执行，并终止 Provider、工具循环和后续事件写入。
- MUST：消息内容使用 `ChatMessagePart` 结构表达，不建立与 shared 契约并行的 renderer/core 消息模型。
- MUST：编辑、重新生成、重试和 fallback 不得产生悬空 run 或不可达 assistant message。

## 上下文、角色与记忆

- MUST：基础 system context、mask 和 companion role 作为系统上下文参与请求，不作为普通消息持久化。
- MUST：新会话捕获其创建时的系统上下文与 active role；后续角色变更不得隐式改写历史会话。
- MUST：上下文预算、摘要、附件、技能、记忆和工具结果由统一上下文边界排序和裁剪。
- MUST：角色指令、记忆正文和摘要内容视为用户敏感内容，不进入日志、工具结果或调试快照。
- MUST：Memory 的提取、维护和可见性遵守当前 companion/session 边界，不得由 renderer 直接拼入 Provider 请求。

## 附件

- MUST：上传、去重、持久化、预览和文本提取归属 `AttachmentService` 及其 core 边界。
- MUST：发送前校验附件存在性、消息关联和当前会话访问权限。
- MUST：文件大小、数量、类型和读取范围由 main/core 的权威限制决定；renderer 不得维护一套独立安全上限。
- MUST：renderer 仅传输受支持的二进制请求，不能指定任意落盘路径。
- MUST：附件正文、二进制、绝对路径和提取结果不得进入日志。
- SHOULD：附件物化失败只影响相关片段，并返回结构化、可恢复的错误。

## Provider

- MUST：Provider 客户端由 `ProviderManager` 创建和选择，调用方不得直接实例化具体 Provider 实现。
- MUST：Provider registry、客户端实现、凭据解析和模型能力是不同边界；配置/preset 的存在不代表可执行。
- MUST：Provider 错误经过统一归一化，保留稳定 code、retryable/recoverable 和安全 message。
- MUST：模型选择遵守显式 session override、全局默认和 fallback 的权威顺序，不得由 UI 或 IPC 临时重排。
- MUST：保存和返回 Provider 时移除秘密字段；API key、OAuth token 和完整认证 header 不得进入 renderer、日志或错误正文。
- MUST：OpenAI Codex OAuth 状态和凭据只由 core/main 边界管理，renderer 只接收非秘密状态。
- MUST：OmniInfer 控制面与模型请求通过 main/core 边界，renderer 不得直接访问本地运行时端口。
- MUST：新增传输协议或 Provider 能力时，shared 能力声明、registry 校验、客户端行为、选择逻辑、UI 和 smoke 保持一致。
- SHOULD：Provider 流实现遵守 abort、tool call、usage 和 final event 的统一语义。

## Agent 与工具

- MUST：Agent 执行通过统一 runner、step engine、tool loop、registry、executor 和 policy 边界。
- MUST：工具定义、可见性、启停状态、风险等级和执行实现保持一致。
- MUST：非 full-access profile 的 write、network 和 exec 风险操作未经策略批准不得执行。
- MUST：full local access 在配置、UI、运行上下文和审计中保持明确，不得伪装为普通 assistant 能力。
- MUST：工具只能访问当前会话明确授权的数据、附件、workspace 和进程。
- MUST：工具结果写回对应 tool-call message part，并发出匹配的 stream event。
- MUST：新增工具同步工具 catalog、执行器、policy、管理状态、配置和验证；不得只注册名称或只实现执行函数。
- MUST：工具参数和结果不进入日志；错误在记录前归一化和脱敏。
- SHOULD：工具执行支持 timeout、abort 和确定性的资源清理。

## Workspace 与 Terminal

- MUST：`workspace_file` 仅操作当前 session 的 managed workspace，并防止父目录穿越、符号链接逃逸、敏感路径访问和资源超限。
- MUST：workspace 写入、patch、导出、删除和清理遵守明确的风险决策与用户动作边界。
- MUST：命令执行只能由 Agent 工具链触发；renderer 仅能管理已登记进程。
- MUST：非 full-access profile 的 cwd 限于 managed workspace；外部路径能力只属于明确授权的 full-access profile。
- MUST：terminal 使用最小环境；完整 `process.env`、凭据和原始 env 不得进入子进程、日志或快照。
- MUST：stdout/stderr、进程数量、运行时间和后台生命周期受权威限制，并支持可靠终止。
- MUST：配置项不得声称提供尚未真实执行的系统级隔离。

## MCP、Skill 与 Cron

- MUST：MCP server 配置、连接、工具发现和启停状态由 core 管理；renderer 不得直接持有 transport 或秘密 header/env。
- MUST：MCP 工具进入统一 tool registry、policy、approval、timeout 和日志脱敏边界。
- MUST：Skill inventory 只暴露已启用且通过校验的 skill；读取 skill 指令不等同于执行其中代码。
- MUST：Skill 内容、MCP payload 和工具结果不得进入日志或请求调试快照。
- MUST：定时任务执行复用现有 Agent、Provider、工具 policy 和 run 状态，不得直接绕过执行链。
- MUST：会话关联任务不得跨会话读取、修改或删除。
- MUST：定时执行开关、runner 状态、配置、UI 和审计记录保持一致。

## 日志与快照

- MUST：聊天链路日志只保留 session/run/provider/model/tool 等标识、状态、耗时、fallback 和安全错误信息。
- MUST NOT：记录 prompt、消息正文、系统/角色指令、记忆、附件、工具参数/结果、Provider 请求/响应或秘密字段。
- MUST：request snapshot 只保存恢复和诊断所需的非秘密结构化状态，并遵守与日志相同的脱敏边界。
- SHOULD：started、completed、failed 和 aborted 生命周期节点具有可关联的结构化记录。

## 权威落点

| 职责 | 路径 |
|------|------|
| 聊天 | `core/chat/` |
| Agent | `core/agent/` |
| 工具 | `core/agent/tools/` |
| Workspace | `core/agent/workspace/` |
| Terminal | `core/agent/terminal/` |
| Provider | `core/provider/` |
| MCP | `core/mcp/` |
| Skill | `core/skill/` |
| Cron | `core/cron/` |
| Memory | `core/memory/` |
| Shared chat/provider/tool 类型 | `shared/types/` |
| renderer 聊天 | `src/components/chat/`、`src/composables/chat/` |

## 自检约束

- [ ] session、message、run 和 stream event 在全部终态一致。
- [ ] 上下文、角色、记忆和附件没有越过会话或日志边界。
- [ ] Provider registry、执行能力、凭据和模型选择没有混为一层。
- [ ] 工具、MCP、workspace 和 terminal 遵守 profile、approval 与最小权限。
- [ ] 相关 chat、provider、agent、tool、MCP、skill 或 local-agent smoke 已通过。
