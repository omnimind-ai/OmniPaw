# Context 管理研究与改进建议

## 结论摘要

当前项目的 context 管理已经有清晰入口，但实现仍停留在“最近 N 条消息 + 当前附件”的阶段：

- `ContextBuilder` 从会话消息里取最近 `maxMessages` 条，默认 40 条。
- `systemPrompt`、skill inventory、tool inventory、附件内容和历史 tool call 会被拼进 provider messages。
- `ContextPolicy` 类型里预留了 `token-budget`、`summary-plus-recent`、`maxInputTokens`、`keepRecentTurns`，但目前没有真正实现。
- 设置页有“上下文最近消息数”，模型也有 `contextWindow` 字段，但核心构建上下文时没有使用这些值。
- 没有按模型上下文窗口预算、没有自动摘要压缩、没有上下文溢出后的降级策略、没有长期记忆或语义检索。

建议优先收敛四件事：

1. 把 system message 做成一等上下文单元：支持基础 system、mask/persona、运行期能力注入，并保证 provider 不支持 system role 时有明确降级策略。
2. 把现有 recent-turns 做扎实：接入全局设置和模型 `contextWindow`，把 tool result、附件、reasoning 纳入真实或估算 token 预算。
3. 实现 Codex 风格的 `token-budget` 和自动 compact：维护结构不变量，基于真实 token usage / 模型窗口触发，而不是只按消息数裁剪。
4. 实现 `summary-plus-recent`：老历史压缩成会话摘要，最近轮次原文保留，compact 后明确 replacement history 的语义边界。

长期可以再引入轻量 memory search，但不建议一开始上完整 agent/memory 平台复杂度。

## 当前项目怎么做

主要落点：

- `core/chat/context-manager.ts`
- `core/agent/run/prepare.ts`
- `core/agent/run/state.ts`
- `core/agent/run/helpers.ts`
- `shared/types/chat.ts`
- `core/chat/chat-service.ts`
- `core/cron/scheduled-task-executor.ts`

数据流大致是：

```text
renderer sendMessage
  -> ChatService 写入 user message + assistant placeholder + run
  -> AgentRunner.prepareAgentRun
  -> ContextBuilder.build
  -> injectToolInventory
  -> Provider.streamChat
  -> tool loop 追加 assistant/tool messages
```

`ContextBuilder.build` 当前做的事：

- 从 `ChatMessageRepo.listBySession` 读取当前 session 全部消息。
- 只保留 `complete` 和 `streaming` 状态，角色只保留 `system`、`user`、`assistant`。
- 按 `session.contextPolicy.maxMessages ?? 40` 取最后 N 条。
- 如果模型支持 system role，就把 `session.systemPrompt` 和 skill inventory 合并成 system message。
- 将 `ChatMessagePart` 转成 provider content：
  - `plain` 转文本。
  - `think` 不作为普通内容，但 assistant reasoning 会写到 `reasoningContent`。
  - 当前消息附件，或 `includeAttachments === 'recent'` 时的附件，会尽量注入图片 data URL 或抽取文本。
  - 其他附件只留下文件名、mime、size 的占位说明。
- assistant 历史里的 `tool_call` part 会重新编译成 OpenAI 风格的 assistant tool call message 和 tool result message。
- 生成 `ProviderRequestSnapshot`，记录 `messageCount`、`attachmentCount`、估算 input tokens、skill 注入信息。

Agent 侧再补一层：

- `prepareAgentRun` 根据 provider/model 是否支持工具决定 `assistant` 或 `fast_chat`。
- `ToolRegistry.resolve` 解析内置工具和 MCP 工具。
- `injectToolInventory` 把可用工具列表作为文本塞进 system 或第一个 user message。
- 真正的 provider tool schema 通过 `tools` 参数传给 provider。

目前的主要问题：

- 按消息数裁剪，不按 token 或模型窗口裁剪。长附件、长 tool result、长代码块会轻易撑爆上下文。
- `ContextPolicy.mode` 预留了 `token-budget` 和 `summary-plus-recent`，但实现里没有分支。
- `estimatedInputTokens` 只是 `JSON.stringify(messages).length / 4`，没有区分文本、图片、工具 schema、system prompt 和 provider 包装开销。
- 设置页 `maxRecentMessages` 没有进入 `ContextBuilder` 默认策略，新会话默认 40，配置默认 20。
- `ProviderModel.contextWindow` 和 `maxOutputTokens` 没有参与 input budget。
- 当前只有 `session.systemPrompt` 这种粗粒度注入；如果 DB、bridge、UI 还没有把 system message 作为一等结构，需要补上，否则后续 mask/persona、角色预设、运行期安全约束会混在同一段文本里，难以裁剪和追踪来源。
- 没有摘要消息或摘要表，编辑、重新生成、删除后的摘要一致性也没有策略。
- 没有 provider context length 错误后的自动收缩重试。
- 没有长期记忆或检索式上下文，历史只能按最近消息进入。

## AstrBot 怎么做

AstrBot 有一套相对完整但仍偏轻量的 context 管理：

- `astrbot/core/conversation_mgr.py` 把“平台会话”和“对话”分开。一个消息会话可以切换多个 conversation，conversation 的 `history` 以 JSON 保存，另有 `token_usage` 字段记录最近一次 provider 返回的 token 用量。
- `astrbot/core/astr_main_agent.py` 构建 `ProviderRequest`：
  - 从 conversation history 加载 `req.contexts`。
  - 当前消息通过 `ProviderRequest.assemble_context()` 追加为 user message。
  - persona、skills、知识库结果、文件提取、图片 caption、安全提示、工具提示等追加到 system prompt 或 user content。
- `astrbot/core/agent/runners/tool_loop_agent_runner.py` 在每个 step 前调用 `ContextManager.process()`。
- `astrbot/core/agent/context/manager.py` 先按轮次截断，再按 token 阈值触发压缩。
- `astrbot/core/agent/context/truncator.py` 会维护 system message，并修复 assistant tool call 与 tool message 配对，避免 provider 拒绝。
- `astrbot/core/agent/context/compressor.py` 有两种策略：
  - `TruncateByTurnsCompressor`：超过阈值后丢弃最老若干轮。
  - `LLMSummaryCompressor`：用指定 provider 总结旧历史，保留最近消息，重建为 `[system, summary user, ack assistant, recent]`。
- `astrbot/core/agent/context/token_counter.py` 有简单 token 估算，并对图片、音频、thinking、tool call 计入额外预算。
- `astrbot/builtin_stars/astrbot/long_term_memory.py` 不是向量记忆，而是一个按消息来源维护的短期聊天室记录列表，可注入 system prompt 或重写当前 prompt。
- `astrbot/core/provider/sources/openai_source.py` 在 provider 返回 context length 错误时，会弹出最早记录并重试。
- `ToolLoopAgentRunner` 对超大工具结果有外溢机制：超过约 27.5k 估算 token 时写入文件，向上下文保留约 7k token preview 和读取提示。

可借鉴点：

- 把 context 压缩抽象成 `ContextManager + ContextConfig + TokenCounter + Compressor`，扩展点清楚。
- 先 enforce max turns，再 token compression，行为容易解释。
- 摘要压缩失败时回退原消息，压缩后仍超限时再 halving truncation。
- 保存 provider 返回的 token usage，优先用真实 usage，而不是总靠估算。
- system prompt、persona begin dialogs、工具规则等多数是运行期注入，保存历史时会过滤首个 system 和 `_no_save` 消息，历史更干净。
- provider context length 报错后有一次“丢最早消息再试”的恢复路径，用户不一定直接看到失败。

局限：

- token counter 仍是估算。
- 摘要压缩是单层摘要，没有摘要版本、摘要来源范围、编辑后失效等机制。
- 长期记忆能力偏插件化和临时性，没有统一进入核心 context policy。

## Codex 和 opencode 怎么做

### Codex

参考 OpenAI Codex 开源实现：

- [`codex-rs/core/src/context_manager/history.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/context_manager/history.rs)
- [`codex-rs/core/src/compact.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/compact.rs)
- [`codex-rs/core/src/compact_remote.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/compact_remote.rs)
- [`codex-rs/core/src/session/turn.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/session/turn.rs)

Codex 的核心思路：

- `ContextManager` 维护模型可见的 thread history，按 `ResponseItem` 而不是简单 chat message 记录。
- 记录 token usage，并结合 API 返回 usage 与本地估算计算 active context。
- history 有 `reference_context_item`，用于追踪当前 turn context 的基线，避免重复注入或错误 diff。
- 在送模型前 normalize：
  - 工具调用和工具结果必须配对。
  - 不支持图片的模型会剥离图片。
  - function output 会按 truncation policy 截断。
- 自动 compaction 分 pre-turn 和 mid-turn/post-sampling 场景：
  - 达到 `model_auto_compact_token_limit` 或完整窗口时触发。
  - 切到更小 context window 模型时，可先用旧模型 compact。
  - provider 支持时走 remote compaction，否则 inline summarization。
- compaction 后不是简单替换成一段 summary，而是安装 replacement history，并按边界重新注入 canonical initial context。
- compaction 有 pre/post hooks、analytics、token 前后对比和失败日志。

对我们最有价值的点：

- context 管理要维护“结构不变量”：system/developer 初始上下文、tool call/result pairing、provider capability、图片/附件能力降级都不能被裁剪流程破坏。
- 优先记录和使用 provider 返回的真实 token usage；没有真实 usage 时再回退本地估算。
- 自动 compact 的触发点应基于真实 token usage、模型窗口和 reserved output tokens，而不是消息条数。
- compact 后要明确 replacement history 的语义边界，不要把旧 system/developer/context 片段重复或混入摘要。
- compact 不是一次性清空历史，而是“生成摘要 + 重装 canonical initial context + 保留最近关键上下文”的结构化替换。

### opencode

参考 opencode：

- [`packages/opencode/src/session/overflow.ts`](https://github.com/sst/opencode/blob/dev/packages/opencode/src/session/overflow.ts)
- [`packages/opencode/src/session/compaction.ts`](https://github.com/sst/opencode/blob/dev/packages/opencode/src/session/compaction.ts)
- [`packages/opencode/src/session/processor.ts`](https://github.com/sst/opencode/blob/dev/packages/opencode/src/session/processor.ts)

opencode 的核心思路：

- `overflow.ts` 根据模型 context/input limit 减去 reserved output tokens，得到 usable input budget。
- 当 assistant response 的 token usage 达到 usable budget，就标记需要 compaction。
- `compaction.ts` 有固定的 summary template，结构包括 Goal、Constraints & Preferences、Progress、Key Decisions、Next Steps、Critical Context、Relevant Files。
- compaction 会识别既有 summary，下一次 compact 时更新 anchored summary，而不是每次从零总结。
- 保留最近 tail turns，并用 `preserve_recent_tokens` 或 usable input 的 25% 计算最近上下文预算。
- 旧历史进入 summary，最近关键上下文原文保留。
- tool output 有单独 prune 逻辑：
  - 保护最近约 40k tokens 的工具输出。
  - 老的、可裁剪的工具输出会被标记 compacted。
  - `skill` 等关键工具可保护不裁。
- 支持插件注入 compaction context 或替换 prompt。
- overflow 自动 compact 后，可以 replay 上一个真实用户消息或 auto-continue。

对我们最有价值的点：

- 摘要模板要结构化，且支持更新已有摘要。
- 保留最近原文要按 token 预算，而不是固定几条。
- tool output prune 应先于整轮丢弃。
- context overflow 不应直接报错给用户，可以先自动 compact/retry。

## 我们可以怎么改进

### 第一阶段：补齐 system message，并把 recent-turns 做正确

改动范围小，适合先做：

- 将 system message 作为一等上下文单元：
  - 基础系统约束、mask、persona、运行期安全规则、skill/tool inventory 分开建模。
  - 每个 system unit 记录来源、优先级、是否可裁剪、是否可持久化。
  - active mask/persona 生成稳定的 system unit，避免把角色设定直接拼进普通 user message。
  - provider 支持 system role 时用 system message；不支持时在 `ContextBuilder` 统一降级为首个 user/developer 等价内容。
- 将 `settings.app.maxRecentMessages` 接入 core：
  - 新会话默认 `contextPolicy.maxMessages` 跟随设置。
  - 旧会话没有 `contextPolicy` 时 fallback 用设置，而不是硬编码 40。
- `ContextBuilder` 增加 budget 计算：
  - `model.contextWindow`
  - `model.maxOutputTokens`
  - provider/tool schema 估算
  - system prompt、mask/persona prompt、skill prompt、tool inventory
  - 当前 user message 和当前附件强保护
- 在 `ProviderRequestSnapshot` 里补充：
  - `contextPolicyMode`
  - `selectedMessageIds`
  - `droppedMessageCount`
  - `estimatedSystemTokens`
  - `estimatedToolTokens`
  - `estimatedAttachmentTokens`
- 为 provider context length error 增加一次收缩重试：
  - 首次失败时降低 `maxMessages` 或切到 `token-budget`。
  - 记录 fallback reason。

### 第二阶段：实现 token-budget policy

把当前按 message slice 改成“context unit selector”：

```text
ContextUnit
  id
  kind: system | mask | persona | skill | tool_inventory | message | attachment | tool_result | summary
  source
  priority
  estimatedTokens
  required
  buildProviderMessages()
```

选择策略：

- 永远保留：
  - 基础 system prompt
  - 当前 active mask/persona system unit
  - 当前 user message
  - 当前消息附件占位或内容
  - 必须配对的 assistant tool call + tool result
- 高优先级：
  - 最近 3 到 6 轮原文
  - 当前 run 相关 tool result
  - reply 引用的消息
- 中优先级：
  - 更早的普通对话
  - 旧 reasoning
- 低优先级：
  - 老 tool result 全文
  - 老附件抽取全文
  - 重复工具 inventory 文本

裁剪顺序建议：

1. 老 tool result soft trim 为头尾摘要。
2. 老附件全文降级为文件占位。
3. 丢弃旧 reasoning。
4. 丢弃旧对话轮次。
5. 仍超限时触发 summary-plus-recent。

这一步可以先不做 LLM 摘要，只保证不会因为长 tool result 或附件爆窗口。

### 第三阶段：实现 summary-plus-recent

新增持久化摘要，建议不要把摘要塞进普通 assistant 消息里，而是单独存：

- `chat_context_summaries`
  - `id`
  - `session_id`
  - `summary`
  - `covered_until_message_id`
  - `source_message_ids` 或范围信息
  - `provider_id`
  - `model_id`
  - `token_estimate_before`
  - `token_estimate_after`
  - `created_at`
  - `updated_at`

运行方式：

- 每次构建上下文：
  - 读取当前 session 最新 summary。
  - summary 作为独立 summary unit 注入，不直接并入 mask/persona/system 原文。
  - summary 覆盖范围之后的消息按 token budget 选取。
- 触发时机：
  - run 结束后，如果真实或估算 input tokens 超过 context window 的 70%。
  - provider 返回 context length error。
  - 用户手动“压缩当前会话”。
- 摘要模板建议结构化，类似 opencode：
  - 目标
  - 用户约束和偏好
  - 已完成
  - 进行中
  - 关键决策
  - 待办
  - 关键文件/附件/工具结果
  - 未解决问题
- 编辑消息或删除消息时：
  - 如果改动落在 summary 覆盖范围内，标记 summary stale。
  - 下次构建时要么禁用 stale summary，要么从改动点重新摘要。

### 第四阶段：UI 和可观测性

设置页可以分两层：

- 全局默认：
  - 最近消息数
  - 最大 input token 百分比
  - 附件策略：仅当前、最近、从不
  - 自动压缩开关
  - 压缩模型
- 会话级：
  - 当前会话 context usage

日志和 snapshot 要避免记录原文，只记录结构化元信息：

- token 估算
- 选中消息数
- 裁剪消息数
- 附件数量
- summary id
- fallback reason

## 推荐实施顺序

1. 补齐 system message 一等建模，明确基础 system、mask/persona、运行期能力注入的边界。
2. 修复设置未接入问题，并统一 `defaultContextPolicy` 来源。
3. 增加 context budget 估算、真实 token usage 记录和 snapshot 字段。
4. 实现 tool result / attachment 的预算内降级，同时维护 tool call/result pairing 等结构不变量。
5. 实现 `token-budget` mode。
6. 新增 summary 表和 `summary-plus-recent` mode。
7. 增加 context length error 自动 compact/retry。

对当前产品最合适的目标，是借鉴 Codex 的 context 管理内核，但保持实现轻量：

```text
小而稳的 core ContextBuilder
  + 一等 system / mask / persona 上下文单元
  + 结构不变量维护
  + 真实 token usage 优先
  + 可解释的 token budget
  + 自动 compact 和会话摘要
  + 只读检索工具
  + 清晰 snapshot
```

这样能显著提升小模型和长会话表现，同时不会把 Electron 客户端拖进过重的 agent 平台复杂度。
