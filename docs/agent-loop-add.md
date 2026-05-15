# OpenOmniClaw 默认助手接入 Agent Loop + 低风险工具

## 当前 Chat Core 状态

当前 `core/chat` 已经具备“多轮对话”的基础，但还不是“多轮任务 / Agent 执行”：

- `ChatService` 支持 session CRUD、发送消息、停止 run、编辑用户消息、重新生成 assistant 消息。
- `ContextBuilder` 会从当前 session 读取最近消息，默认最近 40 条，并注入 system prompt 和附件内容。
- `RunManager` 支持 `runId`、`AbortController`、流式事件推送和 idempotency。
- `AttachmentService` 支持附件落盘、hash 去重、预览、文本抽取、图片 data URL materialize。
- Provider 当前走 OpenAI-compatible chat completions stream，能解析普通内容和 reasoning 内容。

因此当前 AI 可以基于历史进行多轮聊天，但不能自主执行多步任务。缺口是：

- 没有传入 tools。
- 没有解析模型返回的 `tool_calls`。
- 没有执行工具、保存工具结果、把工具结果回灌模型。
- 没有 agent loop 的 step/max step/stop/finalize 机制。
- 没有工具权限、审批、工具事件展示和任务状态。

## 结论

OmniClaw 的目标不是只做“能聊天的桌面应用”，而是对标 OpenClaw：让默认助手能够持续围绕用户目标工作。因此推荐把主体验从 `chat-first` 调整为 `agent-first`：

- 默认助手会话进入 `AgentRuntime`，具备 tool loop 能力。
- 没有 tool call 时，AgentRuntime 退化成普通聊天体验。
- 第一阶段只挂低风险工具，不默认开放 shell、浏览器、任意文件读写、网络访问或剪贴板。
- 纯 chat / fast chat 作为 fallback：用于 provider 不支持工具、用户显式关闭工具、或只想要最低延迟回答。
- 权限策略和工具风险分级从第一天进入架构，即使 MVP 只实现 safe 工具。

换句话说，不再把 agent loop 设计成“高级模式开关”。默认助手应该天然可以 agent loop，只是默认 profile 很保守。

## AstrBot 的 Agent 执行方式

AstrBot 的核心链路是：

`平台消息 -> EventBus -> Pipeline -> ProcessStage -> build_main_agent -> ToolLoopAgentRunner -> Provider -> ToolExecutor -> 响应发送`

关键参考文件：

- 消息进入队列：`AstrBot/astrbot/core/platform/platform.py`
- pipeline 调度：`AstrBot/astrbot/core/pipeline/scheduler.py`
- 插件/LLM 分流：`AstrBot/astrbot/core/pipeline/process_stage/stage.py`
- 主 Agent 构建：`AstrBot/astrbot/core/astr_main_agent.py`
- Agent 循环：`AstrBot/astrbot/core/astr_agent_run_util.py`
- 单步 LLM + 工具循环：`AstrBot/astrbot/core/agent/runners/tool_loop_agent_runner.py`
- 工具抽象：`AstrBot/astrbot/core/agent/tool.py`
- 工具执行器：`AstrBot/astrbot/core/astr_agent_tool_exec.py`

AstrBot 的执行方式：

1. 消息先经过 pipeline，判断是否被插件处理、是否需要唤醒 Agent。
2. `build_main_agent()` 组装 `ProviderRequest`，包括历史、system prompt、persona、附件、工具集合。
3. `ToolLoopAgentRunner.step()` 调用 provider。
4. 如果 LLM 返回普通 assistant 文本，Agent 结束。
5. 如果 LLM 返回 tool calls，则执行工具，生成 tool result message，追加回上下文。
6. 进入下一轮 LLM 调用，直到无工具调用、用户停止、异常或达到 max step。

值得参考的亮点：

- **统一工具抽象**：插件工具、内置工具、MCP 工具、handoff 子 Agent 都收敛到 `FunctionTool` / `ToolSet`。
- **明确的 Agent loop**：`step()` 只做一轮模型调用和工具处理，外层 `run_agent()` 控制 max step、stop、事件输出。
- **工具事件可展示**：工具开始、工具结果、agent stats 都能作为消息链发送到 WebChat。
- **中断机制完整**：用户 stop 会触发 runner 的 abort signal，工具执行过程中也能中断。
- **上下文保护**：支持 context manager、压缩、超大工具结果落盘、重复工具调用提醒。
- **SubAgent handoff**：主 Agent 可以只暴露 `transfer_to_*` 工具，把复杂工具集交给子 Agent，避免主上下文工具 schema 爆炸。
- **插件钩子丰富**：Agent 开始/完成、工具开始/结束、LLM 请求前后都可被插件扩展。

对 Electron 的启发：

- 我们不需要复制 AstrBot 的平台 pipeline，但应该复制它的 `ToolSet + ToolExecutor + ToolLoopRunner` 结构。
- 更值得借鉴的是：LLM 请求可以统一进入 runner；如果模型没有返回 tool call，runner 自然完成为普通 assistant 回复。
- 当前 `ChatService.executeRun()` 不应长期维护两套主要执行心智模型；推荐把默认助手 run 交给 `AgentRunner`，fast chat 只是 fallback。
- 工具事件应直接复用当前 UI 已迁移的 `tool_call` parts 展示能力。

## OpenOmniClaw 的 Agent 执行方式

OpenOmniClaw 的核心链路是：

`Gateway/CLI 入站 -> auto-reply 编排 -> embedded Pi runner 或 CLI backend -> session/prompt 执行 -> tool 执行/事件回传`

关键参考文件：

- embedded runner 外层循环：`OpenOmniClaw/src/agents/pi-embedded-runner/run.ts`
- 单次 attempt：`OpenOmniClaw/src/agents/pi-embedded-runner/run/attempt/attempt.ts`
- 工具集合组装：`OpenOmniClaw/src/agents/openclaw-tools.ts`
- 工具定义适配：`OpenOmniClaw/src/agents/pi-tool-definition-adapter.ts`
- 工具策略：`OpenOmniClaw/src/agents/tool-policy.ts`
- shell 工具与审批：`OpenOmniClaw/src/agents/bash-tools.exec.ts`
- subagent spawn：`OpenOmniClaw/src/agents/tools/sessions-spawn-tool.ts`
- subagent 实际创建：`OpenOmniClaw/src/agents/subagent-spawn.ts`
- 插件工具解析：`OpenOmniClaw/src/plugins/tools.ts`

OpenOmniClaw 的执行方式：

1. Gateway 或 CLI 收到消息，解析 session key、provider、model、workspace、附件、上下文。
2. `runEmbeddedPiAgent()` 做 session/global lane 串行化，处理 auth profile、模型 fallback、rate limit retry、context overflow recovery。
3. 单次 `runEmbeddedAttempt()` 准备 workspace、skill env、session write lock、工具列表、stream wrapper。
4. 真正的模型-工具多步 loop 主要由 `pi-agent-core` / `pi-coding-agent` 的 `activeSession.prompt()` 处理。
5. 本仓库负责工具组装、工具策略、插件 hook、事件回传、中断、历史落盘和失败恢复。

值得参考的亮点：

- **异步 run 模型**：`runId + sessionKey + event stream + abort` 很适合 Electron UI。
- **工具策略管线**：支持 profile/global/agent/group/sandbox/subagent/runtime 多层合并，比 UI 硬编码权限更稳。
- **工具执行签名清晰**：`tool.execute(toolCallId, args, signal, onUpdate)`，天然支持中断和增量更新。
- **审批与 allowlist**：尤其是 `exec` 工具，区分 host/security/ask/elevated，适合桌面端高风险操作。
- **SubAgent spawn**：`sessions_spawn` 把任务交给独立 session，并有深度、并发、allowlist、自动回报等限制。
- **插件 API 边界明确**：插件可注册 tool/hook/http/channel/gateway/cli/service/provider/command。
- **任务恢复能力强**：有 context overflow recovery、auth profile fallback、rate-limit retry、session write lock。

对 Electron 的启发：

- 不建议直接搬 OpenOmniClaw gateway 或 `pi-agent-core` 依赖，否则会重新引入重依赖和复杂配置。
- 但应借鉴它的 agent-first 会话模型、工具策略、run 状态、abort、approval、subagent session 模型。
- 高风险工具必须从第一天就有权限层，否则后续补审批会重构很大。
- OpenClaw 默认强能力的前提是强策略管线；Electron MVP 应先用低风险工具建立 loop，再逐步扩展权限。

## 推荐实现方式

### 总体判断

推荐做一个轻量 TypeScript 原生 Agent Runtime，而不是完整移植 AstrBot 或 OpenOmniClaw。

核心原则：

1. 保留当前 `core/chat` 的 session/message/run/attachment/provider 基础。
2. 在 `core/agent` 新增轻量 agent loop，并作为默认助手会话的主执行引擎。
3. 工具系统学习 AstrBot 的 `ToolSet`，执行签名学习 OpenOmniClaw 的 `tool.execute(toolCallId, args, signal, onUpdate)`。
4. 初期只开放低风险工具，避免一开始实现复杂 sandbox。
5. `core/chat` 负责持久化、run 生命周期和事件分发；`core/agent` 负责 step loop、工具执行和工具结果回灌。
6. 纯 chat / fast chat 是兼容和低延迟 fallback，不是默认助手的长期主路径。

推荐目标架构：

```text
Renderer
  -> preload typed IPC
  -> ChatService.sendMessage()
     -> RunRouter
        -> mode=assistant(default): AgentRunner.run(profile=minimal)
          -> AgentContextBuilder
          -> ToolPolicy.resolve(session/model/profile)
          -> Provider.streamChat(tools)
          -> ToolExecutor.execute()
          -> append tool result
          -> next step
        -> mode=fast_chat(optional): ContextBuilder -> Provider.streamChat(tools=[])
     -> ChatRun events -> Renderer
```

产品语义：

- `assistant`：默认模式，具备 agent loop，但默认仅启用 minimal 低风险工具。
- `fast_chat`：显式低延迟/无工具模式，或者 provider 不支持 tools 时自动 fallback。
- `power` 不是独立模式，而是更高权限的 tool profile；必须带审批和清晰 UI。

### 新增模块

建议新增：

- `core/agent/agent-runner.ts`
  - 负责 max step loop、stop、finalize、错误处理。
- `core/agent/tool.ts`
  - 定义 `AgentTool`、`ToolSet`、tool schema、tool result。
- `core/agent/tool-registry.ts`
  - 注册内置工具和 skill 工具。
- `core/agent/tool-executor.ts`
  - 校验参数、执行工具、处理 timeout、错误归一化。
- `core/agent/tool-policy.ts`
  - allow/deny/profile/危险级别策略。
- `core/agent/agent-events.ts`
  - 把 agent 内部事件转成 `ChatStreamEvent`。

建议扩展：

- `core/chat/chat-service.ts`
  - 增加 `sendMessage({ mode?: "assistant" | "fast_chat", toolProfile?: "minimal" | "assistant" | "power" })`。
  - 默认 `mode` 为 `assistant`，默认 `toolProfile` 为 `minimal`。
  - provider 不支持 tools 时自动走 `fast_chat` fallback，并记录到 run metadata。
- `core/provider/base-provider.ts`
  - `ProviderStreamChunk` 增加 tool call delta/final 表达。
- `core/provider/providers/openai.ts`
  - 支持 request tools。
  - 解析 streamed `tool_calls`。
  - 输出结构化 `tool_call` chunk。
- `shared/types/chat.ts`
  - `ChatRunStatus` 增加可选 `waiting_tool` 不一定必要，MVP 可继续用 `running`。
  - `ChatStreamEvent` 增加 `tool_call` / `tool_result` / `agent_step`。
- `core/db/migrations.ts`
  - 增加 tool call / tool result 的持久化字段，MVP 可先存在 message parts 里。

### Agent Runner 设计

MVP runner 逻辑：

1. 创建 user message 和 assistant placeholder。
2. 构建 provider messages。
3. 根据 `toolProfile`、provider 能力、session 设置，从 `ToolRegistry` 读取当前可用工具。
4. 调用 provider，传入 `tools`。
5. 如果 provider 返回文本，追加到 assistant message。
6. 如果 provider 返回 tool call：
   - 写入 assistant message 的 `tool_call` part，状态 `running`。
   - emit `tool_call` event。
   - 执行工具。
   - 写入 tool result message 或 assistant 的 tool_call result。
   - emit `tool_result` event。
   - 把 assistant tool call 和 tool result 追加进下一轮上下文。
7. 重复直到：
   - 无 tool call。
   - 达到 `maxSteps`。
   - 用户 abort。
   - provider/tool error。
8. 完成时 assistant message 状态改为 `complete`。

默认行为：

- 普通问答如果模型不需要工具，只产生一次 provider 调用，看起来就是普通 chat。
- 需要时间、计算、附件检索等低风险能力时，模型可自动调用工具并继续回答。
- 如果工具被策略拒绝，拒绝结果也作为 tool result 回灌模型，让模型解释限制而不是直接失败。

### Tool 抽象

推荐工具接口：

```ts
export interface AgentTool<TArgs = unknown, TDetails = unknown> {
  name: string
  label?: string
  description: string
  parameters: Record<string, unknown>
  risk: "safe" | "read" | "write" | "network" | "exec"
  ownerOnly?: boolean
  timeoutMs?: number
  execute: (
    toolCallId: string,
    args: TArgs,
    signal?: AbortSignal,
    onUpdate?: (update: unknown) => void,
  ) => Promise<AgentToolResult<TDetails>>
}

export interface AgentToolResult<TDetails = unknown> {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >
  details?: TDetails
}
```

OpenAI schema 可由工具定义转换：

```ts
{
  type: "function",
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
}
```

### 第一批工具

为符合“开箱即用、配置用户友好、小模型友好”，第一批工具只做低风险闭环，不开放 shell/browser/任意文件读写/网络访问。

Phase 1 默认启用：

- `system_time`
  - 获取当前时间、时区。
  - 风险低，适合验证 tool loop。
- `calculator`
  - 做基础计算。
  - 风险低，小模型收益明显。
- `attachment_text_read`
  - 只读取当前会话中用户已上传、且已完成文本抽取的附件。
  - 不接受任意文件路径。
  - 风险为 `safe` 或受限 `read`，适合桌面端 MVP。
- `attachment_text_search`
  - 只在当前会话已上传附件的 extracted text 内搜索。
  - 不扫描磁盘目录。
  - 风险为受限 `read`。

暂不默认启用：

- `file_read`：读取本机路径，即使只读也需要授权目录和路径限制，放到 Phase 2。
- `clipboard_read`：涉及用户隐私，默认关闭。
- `web_search` / `browser`：有网络和外部状态风险，默认关闭。
- `file_write` / `shell` / `exec`：必须等审批 UI 和 policy 完整后再开放。
- `create_reminder`：适合体现持续工作能力，但会写入任务系统，建议放到 Phase 2 或 Phase 4，先完成 loop 基础。

### 工具权限策略

推荐从 MVP 就引入权限字段，而不是后补：

```ts
export interface ToolPolicy {
  enabled: boolean
  profile: "minimal" | "assistant" | "power"
  allow?: string[]
  deny?: string[]
  requireApprovalForRisk?: Array<"write" | "network" | "exec">
}
```

默认策略：

- 默认助手会话：启用 AgentRuntime，`profile=minimal`。
- `minimal`：只启用 `system_time`、`calculator`、当前会话附件文本读取/搜索。
- `assistant`：允许用户授权目录内的 `file_read`、`file_search`，可加入 `create_reminder`。
- Power 模式：可启用写文件、浏览器、shell，但必须二次确认。
- `fast_chat`：不启用 tools，`maxSteps=1`。

危险工具执行前必须支持 `approval-pending`：

1. 工具执行器发现需要审批。
2. emit `approval_required` event。
3. run 进入等待状态，但仍可 abort。
4. UI 展示确认卡。
5. 用户批准后继续执行，拒绝则把拒绝结果作为 tool result 回灌模型。

这点可以借鉴 OpenOmniClaw 的 exec approval，但 Electron MVP 可先做内存态审批，后续再持久化。

### Provider Tool Call 支持

当前 `OpenAICompatibleProvider` 已能把 `request.tools` 放入 body，但 `ChatService` 没有传 tools，provider 也没有解析 tool call stream。

需要补：

1. `ProviderStreamChunk` 增加：

```ts
type ProviderStreamChunk =
  | { type: "delta"; content?: string; reasoning?: string }
  | { type: "tool_call_delta"; id?: string; index: number; name?: string; argumentsDelta?: string }
  | { type: "tool_call_final"; toolCalls: ProviderToolCall[] }
  | { type: "final"; finishReason?: string; usage?: TokenUsage }
```

2. OpenAI stream 中聚合 `choices[0].delta.tool_calls`。
3. 当 `finish_reason === "tool_calls"` 时输出 `tool_call_final`。
4. AgentRunner 接管 tool calls。
5. `fast_chat` 不传 tools；如果 provider 不支持工具，默认助手 run fallback 到 `fast_chat` 并记录原因。

### Tool Result 上下文格式

下一轮 provider messages 应符合 OpenAI tool calling 格式：

```ts
[
  {
    role: "assistant",
    content: "",
    toolCalls: [
      {
        id: "call_x",
        type: "function",
        function: { name: "system_time", arguments: "{}" },
      },
    ],
  },
  {
    role: "tool",
    toolCallId: "call_x",
    content: "2026-05-15 15:00:00 Asia/Shanghai",
  },
]
```

UI 展示则继续使用当前 `tool_call` part：

```ts
{
  type: "tool_call",
  tool_calls: [
    {
      id: "call_x",
      name: "system_time",
      arguments: {},
      result: "...",
      status: "complete",
    },
  ],
}
```

不要把 UI 的 `tool_call` part 直接当 provider 输入。应该由 `ContextBuilder` 编译成 provider-specific messages。

## 推荐实施阶段

### Phase 1：默认助手 Agent Loop + 低风险工具

目标：默认助手会话具备 tool call -> tool result -> 继续回答的能力，同时只开放低风险工具。

范围：

- 新增 `core/agent` 基础类型、runner、registry、executor。
- 增加 `system_time`、`calculator`、`attachment_text_read`、`attachment_text_search`。
- 引入 `ToolPolicy` 和 `toolProfile=minimal`，即使 Phase 1 只允许 safe/read-limited 工具。
- OpenAI provider 支持 tool call stream 解析。
- ChatService 默认走 `mode: "assistant"`，可显式走 `mode: "fast_chat"`。
- UI 显示工具调用卡片。
- 支持 abort。
- max step 默认 6。

验收：

- 用户问“现在几点，帮我算 123*456”，Agent 会调用工具并最终回答。
- 用户只说“写一首短诗”时，模型不调用工具，体验等同普通 chat。
- 上传 txt/md/json 后，Agent 可读取或搜索当前会话附件文本。
- 中途停止后 run、message、tool_call part 状态正确。
- 默认工具列表不包含 shell、browser、network、file_write、任意路径 file_read。

### Phase 2：授权文件与轻任务工具

目标：让 Agent 能围绕用户授权的文件和轻量任务继续工作。

范围：

- `file_read` 只允许读取用户明确授权目录内的文件。
- `file_search` 支持用户授权目录。
- 工具结果过长时截断并提示。
- ContextBuilder 能把 tool result 编译回 provider messages。
- `create_reminder` 与 `core/cron` 做最小打通，默认可要求确认。

验收：

- 用户授权某个目录后，Agent 能读取、总结、搜索该目录内文件。
- 未授权路径读取会被拒绝，并作为 tool result 回灌模型。
- 用户要求提醒时，Agent 能创建受限提醒任务。

### Phase 3：审批与写操作

目标：支持低风险自动执行，高风险明确确认。

范围：

- `approval_required` stream event。
- UI 确认卡。
- `file_write` / `clipboard_write` 默认需要审批。
- 工具执行 timeout。
- 工具错误标准化。

验收：

- Agent 请求写文件时 UI 弹确认。
- 用户拒绝后 Agent 能解释未执行。
- 用户批准后工具执行并继续总结。
