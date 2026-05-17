# 聊天 / Provider / Agent 规范

## 建议阅读顺序

按任务类型展开：

1. 聊天会话/消息/run：读 `聊天运行流`
2. 附件：读 `附件`
3. Provider/模型：读 `Provider`
4. Agent/工具：读 `Agent 与工具`
5. Skill/Cron：读 `Skill 与 Cron`
6. 涉及 repo/schema：再读 [core.md](core.md) 的 `数据库`

---

## 聊天运行流

- MUST：聊天入口通过 `ChatService`，不要让 IPC handler 或 renderer 直接操作 repo。
- MUST：会话、消息、run 的持久化通过 `core/db/repos/`。
- MUST：发送消息时先创建 user message、assistant 占位 message 和 run，再启动流式执行。
- MUST：对流式任务维护 run 状态，并通过 `RunManager` 发出结构化 stream event。
- MUST：支持 abort；中止时同步 run 状态和 assistant message 状态。
- MUST：使用 `ChatMessagePart` 表达文本、推理、图片、文件、回复、工具调用等消息片段。
- SHOULD：使用结构化 request，不继续扩散 legacy 多参数调用方式。
- SHOULD：为长运行任务记录 request snapshot，便于排查模式、工具、上下文和 fallback 原因。
- SHOULD：UI 中的流式展示基于 `onStreamEvent`，legacy token/done 订阅只作为过渡。

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
- MUST：认清当前传输实现边界：真正可执行的 Provider client 只有 OpenAI-compatible chat completions；Ollama 和 OmniInfer 当前主要是 preset/config 形态，接入执行前必须补 provider implementation。
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
- MUST：默认拒绝需要 approval 的 write、network、exec 风险工具，直到产品有明确授权流程。
- MUST：工具结果写回 assistant message 的 tool call part，并发出对应 stream event。
- MUST：工具只能访问当前会话授权范围内的数据。
- MUST：新增内置工具时同步工具定义、执行逻辑、管理列表、工具开关和策略可见性。
- MUST：认清当前工具边界：内置工具只有 `system_time`、`calculator`、`attachment_text_read`、`attachment_text_search`；没有 shell、文件写入、任意网络访问工具。
- SHOULD：工具执行支持超时和 abort。
- MAY：扩展 tool profile，但必须同步 policy、工具定义和 UI 管理。

新增工具 Playbook：

1. 更新内置工具定义和执行器。
2. 更新 tool policy 的 profile 可见性。
3. 更新 tool management 显示和开关。
4. 确认风险等级和 approval 行为。
5. 添加或运行 agent/tool smoke。

## Skill 与 Cron

- MUST：Skill、Cron 当前能力保持轻量边界。
- MUST：Cron 当前为空列表；新增真实执行能力前先补契约、存储和安全策略。
- MUST：Skill 当前不是完整 agent 执行链；接入 agent 前先补加载、启用、权限和执行边界。
- MAY：对 Skill/Cron 先提供只读列表，执行能力后续补齐。

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
| Agent | `core/agent/agent-runner.ts` |
| 工具定义 | `core/agent/builtin-tools.ts` |
| 工具注册 | `core/agent/tool-registry.ts` |
| 工具执行 | `core/agent/tool-executor.ts` |
| 工具策略 | `core/agent/tool-policy.ts` |
| Provider 管理 | `core/provider/manager.ts` |
| Provider 抽象 | `core/provider/base-provider.ts` |
| OpenAI 兼容 Provider | `core/provider/providers/openai.ts` |
| 聊天 shared types | `shared/types/chat.ts` |
| Provider shared types | `shared/types/provider.ts` |
| renderer 消息 composable | `src/composables/useMessages.ts` |
| renderer 附件 composable | `src/composables/useMediaHandling.ts` |

## 自检清单

- [ ] run、message、stream event 状态一致。
- [ ] abort 路径更新 run 和 assistant message。
- [ ] Provider 错误已归一化。
- [ ] 工具风险等级和 policy 已核对。
- [ ] 附件访问仅限当前会话可用范围。
- [ ] 已运行相关 chat/agent/tool smoke 或说明未运行原因。
