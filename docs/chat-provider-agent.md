# 聊天 / Provider / Agent 规范

## 建议阅读顺序

按任务类型展开：

1. 聊天会话/消息/run：读 `聊天运行流`
2. 系统上下文/角色：读 `系统上下文与 Role`
3. 附件：读 `附件`
4. Provider/模型：读 `Provider`
5. Agent/工具：读 `Agent 与工具`
6. 本地 workspace/terminal：读 `本地 Workspace 与 Terminal`
7. Skill/Cron：读 `Skill 与 Cron`
8. 涉及 repo/schema：再读 [core.md](core.md) 的 `数据库`

---

## 聊天运行流

- MUST：聊天入口通过 `ChatService`，不要让 IPC handler 或 renderer 直接操作 repo。
- MUST：会话、消息、run 的持久化通过 `core/db/repos/`。
- MUST：`chat`、`cat`、`vision` 的会话创建、复用和 kind 校验语义归属 `ChatService`；Observation、Electron main、cat runtime 等调用方不得绕过 `ChatService` 直接用 session repo 决定或创建这些会话。
- MUST：普通 `chat` 新建会话语义不得和运行态 get-or-create 语义混用；只有运行态拥有的 `cat` / `vision` 会话可以复用已存在 active session。
- MUST：发送消息时先创建 user message、assistant 占位 message 和 run，再启动流式执行。
- MUST：对流式任务维护 run 状态，并通过 `RunManager` 发出结构化 stream event。
- MUST：支持 abort；中止时同步 run 状态和 assistant message 状态。
- MUST：使用 `ChatMessagePart` 表达文本、推理、图片、文件、回复、工具调用等消息片段。
- SHOULD：使用结构化 request，不继续扩散 legacy 多参数调用方式。
- SHOULD：为长运行任务记录 request snapshot，便于排查模式、工具、上下文和 fallback 原因。
- SHOULD：UI 中的流式展示基于 `onStreamEvent`，legacy token/done 订阅只作为过渡。

## 系统上下文与 Role

- MUST：基础 system prompt、mask、role 作为会话 `systemContext` 进入上下文，不作为普通聊天消息持久化。
- MUST：新会话创建时捕获当前默认系统上下文和 active role；后续修改角色不隐式改写已有会话。
- MUST：role prompt 与 mask text 视为用户指令类敏感内容，不写入日志、tool result、request snapshot 或 renderer debug context。
- SHOULD：上下文选择保持 base system、mask、role 高于摘要、技能 inventory 和普通消息。

## 日志

- MUST：聊天、Provider、Agent 和工具链路的日志只记录 sessionId、runId、providerId、modelId、tool name、status、duration、fallback reason、error code/message、retryable/recoverable 等结构化信息。
- MUST：不得记录原始 prompt、system prompt、role prompt、mask text、消息正文、附件内容、tool args/result、Provider 响应体、API key、凭据或 MCP 原始 env/header。
- MUST：错误进入日志前先走已有归一化和脱敏流程，避免把原始异常对象和敏感上下文直接写出。
- SHOULD：长运行或流式路径在 started、completed、failed、aborted 等节点补齐日志，便于追踪 run 生命周期。
- SHOULD：debug 级上下文只保留最小可追踪信息。

## 附件

- MUST：上传附件通过 `AttachmentService`。
- MUST：消息发送前校验 attachment link。
- MUST：限制附件大小、数量和当前会话可访问范围。
- MUST：Renderer 上传附件传 `ArrayBuffer`，落盘、预览、文本抽取只在 main/core 侧发生。
- SHOULD：附件 materialize 和上下文拼装放在 `ContextBuilder` 附近。

当前限制：

| 项 | 限制 |
|----|------|
| 单文件大小 | 25MB |
| 单消息附件数 | 12 |

## Provider

- MUST：Provider 调用通过 `ProviderManager.createProviderClient` 获取客户端。
- MUST：Provider 错误通过 `normalizeProviderError` 归一化。
- MUST：保存 Provider 配置时经过 `ProviderManager`，不要绕过配置 store。
- MUST：认清当前传输实现边界：可执行的 Provider client 包括 OpenAI-compatible chat completions 与 OmniInfer（继承自前者，叠加懒加载语义）。Ollama 目前仍是 preset/config 形态，接入执行前必须补 provider implementation。
- MUST：OmniInfer provider 走主进程 IPC + 控制面 HTTP，所有 `/omni/*` 请求经主进程；renderer 不直接 fetch `127.0.0.1:19157`。
- MUST：OmniInfer provider 的 `streamChat` 在发请求前会调用 `OmniInferRuntimeService.ensureModelLoaded` 自动 `/omni/model/select`，调用方传递的 `modelId` 是 OmniPaw 内部 id，provider 会自动翻译为绝对路径。
- SHOULD：对 Provider capability、model capability 和 compat 做显式判断，不靠 provider 名称硬编码。
- SHOULD：对 fallback 到 `fast_chat` 的原因写入 run request snapshot。
- SHOULD：保持 OpenAI 兼容 Provider 的 SSE 解析和 tool call 聚合集中在 provider 实现内。
- SHOULD：对模型选择优先使用 session override，再回退到 Provider 默认模型。
- MAY：为不同 Provider 增加专用 provider implementation，但对外仍实现 `BaseProvider`。

新增 Provider 能力 Playbook：

1. 更新 shared Provider 类型和配置类型。
2. 更新 `ProviderManager` 的读取、保存、sanitize 和 client 创建。
3. 更新具体 Provider implementation。
4. 更新设置页 Provider 表单。
5. 更新 smoke 或添加覆盖。

## Agent 与工具

- MUST：Agent 工具由 `ToolRegistry` 注册，由 `ToolExecutor` 执行，由 `ToolPolicy` 决策。
- MUST：非 power profile 的 write、network、exec 风险工具默认进入 approval 流程；未授权不得执行。
- MUST：power profile 代表 full local access，入口、设置和日志上下文必须明确区分，不当作普通 assistant profile。
- MUST：工具结果写回 assistant message 的 tool call part，并发出对应 stream event。
- MUST：工具只能访问当前会话授权范围内的数据。
- MUST：新增内置工具时同步工具定义、执行逻辑、管理列表、工具开关和策略可见性。
- MUST：tool profile 决定可见工具；`minimal` 只暴露 safe/read 工具，`assistant` 和 `power` 才能暴露任务、workspace 和 terminal 类工具。
- MUST：认清当前内置工具边界：`system_time`、`calculator`、`attachment_text_read`、`attachment_text_search`、`future_task`、`skill_read`、`workspace_file`、`terminal_exec`。
- MUST：工具和 Provider 错误在写日志前先归一化，不直接把原始异常、请求体或回包正文塞进日志上下文。
- SHOULD：工具执行支持超时和 abort。
- MAY：扩展 tool profile，但必须同步 policy、工具定义和 UI 管理。

新增工具 Playbook：

1. 更新内置工具定义和执行器。
2. 更新 tool policy 的 profile 可见性。
3. 更新 tool management 显示和开关。
4. 确认风险等级和 approval 行为。
5. 添加或运行 agent/tool/local-agent smoke。

## 本地 Workspace 与 Terminal

- MUST：`workspace_file` 只操作当前 session 的 managed workspace，禁止父目录穿越、符号链接逃逸、敏感路径和超过配置上限的读写。
- MUST：workspace 写入和 patch 必须走工具风险决策和 approval plan；renderer 不能直接发起 agent 写盘能力。
- MUST：workspace 导出、删除和清理必须是显式 bridge 操作，不能由聊天工具隐式触发。
- MUST：`terminal_exec` 只能通过 Agent 工具链触发；renderer 只允许列出、查看、终止已登记进程，不提供任意命令 IPC。
- MUST：assistant profile 的 terminal 默认 ask-first，并受 approval/allow/deny 和命令 allow/deny pattern 约束；power profile 是 full local access。
- MUST：terminal cwd 默认限制在 managed workspace；只有 full access profile 才能使用本机绝对路径或外部路径。
- MUST：terminal 环境变量采用最小白名单和显式 env，不把完整 `process.env`、凭据或原始 env 写入日志/request snapshot。
- MUST：terminal stdout/stderr 只作为工具结果或进程尾部摘要按配置截断；日志只记录状态、耗时和 id。
- MUST：后台进程必须受数量和生命周期上限控制，并支持 list/get/kill。
- SHOULD：不要把 network/pty 配置标记当成系统级隔离；依赖真实 enforcement 前先补契约、实现和 smoke。

## Skill 与 Cron

- MUST：Skill 与 Cron 保持会话边界和最小权限，不绕过 Provider、tool profile、approval 或 run 状态管理。
- MUST：`skill_read` 只读取已启用 skill 的指令内容，不执行 skill 内任意代码或脚本。
- MUST：Skill inventory 注入和 `skill_read` 内容不进入日志或 request snapshot。
- MUST：`future_task` 只能管理当前聊天会话关联的任务，不跨会话创建、编辑或删除。
- MUST：scheduled task 执行仍走既有 Agent/provider/tool policy，不直接调用工具实现或 Provider client。
- MUST：`scheduledTasks.enabled` 默认关闭；开启执行能力时同步配置、UI、runner 状态和 smoke。

## 酒馆角色扮演模式

- MUST：酒馆模式通过 `ChatSession.metadata.tavern` 表达会话级绑定，不改变 `minimal`、`assistant`、`power` 的工具权限语义。
- MUST：角色卡字段、世界书正文、message examples、greeting 和 post-history instructions 都按用户指令类敏感 prompt 处理；日志、request snapshot、toast 错误和非编辑诊断只记录 ID、hash、数量、token 估算、错误码和 recoverability。
- MUST：renderer 只能通过 `appBridge.tavern` 管理角色、世界书和创建/更新酒馆会话，不直接导入 `core/tavern`、Node、Electron main、数据库或 registry 文件。
- MUST：酒馆会话默认走低噪声 run profile：`fast_chat`、`minimal`、无 tool inventory、无 provider-native tools、无 skill inventory；不得修改全局 `agentToolProfile`。
- MUST：酒馆角色、世界书、examples 和 post-history 作为独立 context units 进入 `ContextBuilder`，不写入普通聊天消息；只有用户可见开场白会作为本地 assistant message 保存，并带 `metadata.tavern.greeting`。
- MUST：本地 greeting 没有 provider run，不能作为普通 provider assistant message regenerate；无用户消息前可替换 greeting，有用户消息后不得自动改写可见历史。
- SHOULD：世界书激活保持 deterministic：constant 条目、关键词命中、priority/order、命中位置和稳定 ID tie-break；预算丢弃只进入脱敏 accounting。

## 消息片段变更

新增 `ChatMessagePart` 类型时：

1. 更新 `shared/types/chat.ts`。
2. 更新 repo JSON 映射相关使用点。
3. 更新 `ContextBuilder` 和 Provider 消息转换。
4. 更新 renderer 展示和发送逻辑。
5. 核对附件、工具或引用权限边界。

## 常见落点

| 职责 | 路径 |
|------|------|
| 聊天服务 | `core/chat/chat-service.ts` |
| 上下文 | `core/chat/context-manager.ts` |
| run 管理 | `core/chat/run-manager.ts` |
| 附件 | `core/chat/attachment-service.ts` |
| Agent 运行入口 | `core/agent/agent-runner.ts` |
| Agent step engine | `core/agent/step-engine.ts` |
| Agent run 支撑模块 | `core/agent/run/` |
| 工具调用循环 | `core/agent/tool-loop.ts` |
| 工具定义 | `core/agent/tools/builtin-tools.ts` |
| 工具注册 | `core/agent/tools/registry.ts` |
| 工具执行 | `core/agent/tools/executor.ts` |
| 工具策略 | `core/agent/tools/policy.ts` |
| Agent workspace | `core/agent/workspace/service.ts` |
| Terminal service | `core/agent/terminal/terminal-service.ts` |
| Process supervisor | `core/agent/terminal/process-supervisor.ts` |
| Provider 管理 | `core/provider/manager.ts` |
| Provider 抽象 | `core/provider/base-provider.ts` |
| OpenAI 兼容 Provider | `core/provider/providers/openai.ts` |
| 聊天 shared types | `shared/types/chat.ts` |
| Provider shared types | `shared/types/provider.ts` |
| 酒馆 shared types | `shared/types/tavern.ts` |
| 酒馆 registry / manager | `core/tavern/` |
| 酒馆 IPC | `electron/ipc/tavern.ts` |
| 酒馆 renderer store | `src/stores/tavern.ts` |
| 酒馆管理 UI | `src/components/tavern/` |
| renderer 消息 composable | `src/composables/useMessages.ts` |
| renderer 附件 composable | `src/composables/useMediaHandling.ts` |

## 自检清单

- [ ] run、message、stream event 状态一致。
- [ ] abort 路径更新 run 和 assistant message。
- [ ] systemContext/role 没有被误写入普通消息、日志或 request snapshot。
- [ ] Provider 错误已归一化。
- [ ] 工具风险等级和 policy 已核对。
- [ ] workspace/terminal 的 profile、approval、full access 边界已核对。
- [ ] 附件访问仅限当前会话可用范围。
- [ ] 已运行相关 chat/agent/tool/local-agent smoke 或说明未运行原因。
