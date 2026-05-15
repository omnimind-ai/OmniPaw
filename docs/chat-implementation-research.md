# OpenOmniClaw Electron Chat 实现研究

本文档研究 `AstrBot/` 与 `OpenOmniClaw/` 中 chat、附件、上下文历史、provider 管理的实现方式，并给出 `OpenOmniClaw-electron` 的推荐落地方案。配套的数据结构草案见 [chat-data-structures.md](chat-data-structures.md)。

## 目标范围

本次要实现的能力可以拆成三条主线：

1. OpenAI 兼容端口的 chat：支持 `/v1/chat/completions` 类接口、流式输出、模型选择、错误处理。
2. 聊天可携带图片、文件等附件：图片进入多模态模型，普通文件可被保存、预览、抽取文本后进入上下文。
3. 上下文管理、历史记录、provider 管理：会话列表、消息持久化、上下文裁剪、provider/model/credential 配置。

当前 Electron 项目已经迁移了 AstrBot 的聊天 UI，但核心能力仍是 mock 或骨架：

- `src/composables/useMessages.ts` 仍调用 `/api/chat/*` REST/SSE mock。
- `src/composables/useMediaHandling.ts` 仍调用 `/api/chat/post_file` 上传附件。
- `src/api/omniclawMock.ts` 提供 UI 阶段 mock。
- `core/chat/session-manager.ts`、`core/chat/context-manager.ts`、`core/provider/manager.ts`、`core/provider/providers/openai.ts` 仍是内存或占位实现。
- `shared/types/chat.ts` 与 `shared/types/provider.ts` 只有最小字段，尚不能表达附件、流式 run、provider 能力、消息状态。

## AstrBot 的实现

### 总体链路

AstrBot 的核心链路是“平台消息归一化 -> pipeline -> agent/provider -> 历史保存”：

1. 平台适配器把各平台原始消息转换为统一的 `AstrBotMessage`，字段包括 `session_id`、`message_id`、`sender`、`message: list[BaseMessageComponent]`、`message_str`。相关文件：`AstrBot/astrbot/core/platform/astrbot_message.py`。
2. `AstrMessageEvent` 包装 `AstrBotMessage`，生成 `unified_msg_origin = platform_id:message_type:session_id`，该值贯穿锁、provider 选择、conversation、插件过滤和统计。相关文件：`AstrBot/astrbot/core/platform/astr_message_event.py`。
3. Pipeline 先预处理附件和语音，再做唤醒判断，然后进入 LLM 请求阶段。相关文件：`AstrBot/astrbot/core/pipeline/preprocess_stage/stage.py`、`AstrBot/astrbot/core/pipeline/waking_check/stage.py`、`AstrBot/astrbot/core/pipeline/process_stage/method/agent_request.py`。
4. `InternalAgentSubStage.process()` 按 `unified_msg_origin` 加会话锁，构建 main agent，调用 provider，最后保存 history。相关文件：`AstrBot/astrbot/core/pipeline/process_stage/method/agent_sub_stages/internal.py`。
5. `build_main_agent()` 读取当前消息、附件、persona、工具、知识库、conversation history，组装 `ProviderRequest`。相关文件：`AstrBot/astrbot/core/astr_main_agent.py`。
6. OpenAI 适配器把 `ProviderRequest` 组装成 OpenAI `messages`，再调用 `client.chat.completions.create()`。相关文件：`AstrBot/astrbot/core/provider/sources/openai_source.py`。
7. 请求结束后保存 OpenAI 格式 history，并在 WebChat 侧保存平台展示历史。相关文件：`AstrBot/astrbot/core/conversation_mgr.py`、`AstrBot/astrbot/core/db/po.py`、`AstrBot/astrbot/dashboard/routes/chat.py`。

### Chat 与 OpenAI 兼容 provider

AstrBot 的 provider 抽象在 `AstrBot/astrbot/core/provider/provider.py`：

- `Provider.text_chat()`：非流式文本对话。
- `Provider.text_chat_stream()`：流式文本对话，最后返回完整结果。
- `STTProvider`、`TTSProvider`、`EmbeddingProvider`、`RerankProvider` 与 chat provider 并列。

`ProviderRequest` 是 provider 层的统一输入，定义在 `AstrBot/astrbot/core/provider/entities.py`：

- `prompt`
- `session_id`
- `image_urls`
- `audio_urls`
- `extra_user_content_parts`
- `contexts`
- `system_prompt`
- `conversation`
- `tool_calls_result`
- `model`

OpenAI 适配器的关键特点：

- 以 OpenAI `messages` 为内部上下文标准。
- 当前用户输入如果有图片或音频，会变成 `content: [{ type: "text" }, { type: "image_url" }, ...]`。
- 图片会 materialize 为 base64 data URL。
- 普通文本无附件时保留 `content: string` 的简单格式以兼容旧模型。
- 流式和非流式共用 `_prepare_chat_payload()`。
- 有错误恢复：429 换 key、context length 超限时弹出旧 turn、不支持图片时降级文本、不支持工具时移除 tools。

设计上的可借鉴点：

- `ProviderRequest` 把 provider 输入和 UI 输入隔离开。
- OpenAI messages 作为历史标准，跨 provider 复用成本低。
- provider 管理支持“全局默认”和“按会话选择”。
- 流式响应里显式区分文本、reasoning、tool call、tool result。

限制：

- 文件不是原生 LLM file object。默认只是注入 `[File Attachment: name..., path...]` 文本，真正内容抽取依赖额外分支。
- 图片历史长期保留为 data URL 时容易撑大上下文。
- provider 兼容性大量依赖错误字符串匹配。
- `ProviderRequest.assemble_context()` 与 OpenAI provider 内部 `assemble_context()` 有重复逻辑。

### 附件与 WebChat

AstrBot WebChat 的附件链路在 `AstrBot/astrbot/dashboard/routes/chat.py` 与 `AstrBot/astrbot/core/platform/sources/webchat/message_parts_helper.py`：

1. 前端上传文件到 `/chat/post_file`。
2. 后端保存文件到 `data/attachments`，在 `attachments` 表记录 `attachment_id/path/type/mime_type`。
3. 发送消息时，前端只传 `message parts` 和 `attachment_id`。
4. 后端通过 `attachment_id` 找到本地 path，转换成 WebChat message parts。
5. WebChat adapter 再把 parts 转换成 `Plain/Image/Record/Video/File/Reply` 等统一组件。
6. `build_main_agent()` 将图片转入 `req.image_urls`，将文件和视频转成额外文本提示。

WebChat 展示历史单独存在 `platform_message_history` 表：

- `content` 是 `{ type: "user" | "bot", message: MessagePart[] }`。
- `llm_checkpoint_id` 把展示消息和 LLM conversation history 中的 checkpoint 对齐。
- side thread、编辑、重新生成都依赖 checkpoint 定位 turn。

设计上的可借鉴点：

- UI 展示协议使用 message parts，不直接暴露 provider messages。
- 附件上传先落盘，消息里只引用 `attachment_id`。
- 展示历史和 LLM 上下文历史分开，有利于 UI 展示、编辑和 provider 输入裁剪。
- checkpoint 设计对编辑和重新生成很实用。

限制：

- WebChat REST/SSE 适合 Web 服务，但 Electron 内应优先用 IPC。
- `filename` 兼容路径和 attachment id 的历史逻辑较多，长期会增加复杂度。

### 上下文与历史

AstrBot 将“会话”和“对话”分离：

- `PlatformSession` 表示一个聊天窗口。
- `ConversationV2` 表示该窗口当前或历史 LLM 对话。
- `ConversationManager` 维护 `unified_msg_origin -> 当前 conversation_id`。
- `ConversationV2.content` 是 OpenAI 格式 message list。
- `PlatformMessageHistory` 保存 UI/平台侧的消息历史。

这个设计适合多平台机器人，因为一个平台 session 可以切换多个 conversation。Electron 桌面 chat 可以简化：一个 `session` 默认绑定一个当前上下文，但仍保留 `conversation_id` 或 `checkpoint_id`，以支持未来分支、线程、回滚。

## OpenOmniClaw 的实现

### 总体链路

OpenOmniClaw 的 chat 更像“控制台网关 + agent runtime”：

1. UI 通过 gateway RPC 调用 `chat.send`、`chat.history`、`sessions.list`、`sessions.patch` 等方法。
2. `chat.send` 对输入做清洗、附件归一化、上传路径校验、图片解析，然后构造 `MsgContext`。
3. `dispatchInboundMessage()` 进入 auto-reply/agent runner。
4. `runEmbeddedPiAgent()` 解析 provider/model/auth/context window，创建 `pi-coding-agent` session。
5. session runtime 读取 transcript，清理历史，执行 prompt，订阅流式事件。
6. 输出通过 gateway broadcast 成 `chat` 事件，历史从 transcript JSONL 回放。

关键文件：

- `OpenOmniClaw/src/gateway/server-methods/chat/index.ts`
- `OpenOmniClaw/src/gateway/server-methods/chat/chat-send-flow.ts`
- `OpenOmniClaw/src/gateway/server-methods/chat/chat-history.ts`
- `OpenOmniClaw/src/gateway/server-methods/chat/chat-events.ts`
- `OpenOmniClaw/src/gateway/session-utils.fs.ts`
- `OpenOmniClaw/src/config/sessions/types.ts`
- `OpenOmniClaw/src/config/sessions/store/index.ts`

### Provider 与模型管理

OpenOmniClaw 将 provider catalog、model metadata、credential/auth profile 分开：

- `ModelProviderConfig`：`baseUrl/apiKey/auth/api/headers/authHeader/models`。相关文件：`OpenOmniClaw/src/config/types.models.ts`。
- `ModelDefinitionConfig`：`api/input/contextWindow/maxTokens/compat/cost`。
- `resolveModelWithRegistry()`：先查 registry，再查 inline provider，再做 OpenRouter 和 configured provider fallback。相关文件：`OpenOmniClaw/src/agents/pi-embedded-runner/model.ts`。
- `resolveApiKeyForProvider()`：按 profile、env、models.json apiKey、AWS SDK 等顺序解析 credential。相关文件：`OpenOmniClaw/src/agents/model-auth.ts`。

OpenAI 兼容 provider 不是每个都写独立 client，而是通过 `api: "openai-completions"` 或 `api: "openai-responses"` 加 `baseUrl` 复用 transport。

设计上的可借鉴点：

- provider、model、auth 三者解耦。
- model 上显式记录 `input: ["text", "image"]`、`contextWindow`、`maxTokens`、`compat`。
- 未知但已配置 provider 时可默认按 OpenAI compatible 处理。
- auth profile 允许同一 provider 有多组 key，并为 failover 和 cooldown 留空间。

限制：

- 该套依赖 `pi-ai/pi-coding-agent` 的 runtime 能力，直接搬到 Electron core 会过重。
- provider 兼容字段很多，MVP 不必一次实现完整 failover、auth profile 和 usage quota。

### 附件与媒体

OpenOmniClaw 的附件处理重点在 gateway：

- `normalizeRpcAttachmentsToChatAttachments()` 把 RPC 附件统一为 `{ type, mimeType, fileName, content, path }`。相关文件：`OpenOmniClaw/src/gateway/server-methods/attachment-normalize.ts`。
- `storeControlUiChatUploads()` 将上传内容写入 tmp uploads 目录，限制数量和大小，并嗅探 MIME。相关文件：`OpenOmniClaw/src/gateway/control-ui-chat-uploads.ts`。
- `parseMessageWithAttachments()` 将图片转成 `{ type: "image", data, mimeType }`，普通文件不直接走图片链路。相关文件：`OpenOmniClaw/src/gateway/chat-attachments.ts`。
- `media/input-files.ts` 支持 base64/url 图片和文件，提供文本/PDF 抽取、MIME 限制、大小限制和 SSRF 防护。

设计上的可借鉴点：

- 附件先落盘或归一化，再进入 chat send。
- 图片作为当前 prompt 的结构化输入，历史里尽量不长期保留图片二进制。
- 普通文件通过抽取文本或 media note 进入上下文。
- 上传路径必须限制在受控 root 下。

限制：

- 主 chat 中普通文件不是通用 LLM file object，更多是文本抽取或 prompt note。
- HTTP 远程图片在 native image injection 中限制较多。

### 上下文与历史

OpenOmniClaw 使用 session store + transcript：

- session store 是 JSON store，保存 `sessionId/model/modelProvider/thinkingLevel/contextTokens/token usage/route` 等元数据。
- transcript 是 JSONL，每行可能是 session header、message、compaction 等事件。
- `chat.history` 从 transcript 读取 message，做清洗、截断、去掉大 payload 和敏感字段。
- `sessions.reset/delete/compact` 负责归档 transcript、清理 runtime、清理队列。

设计上的可借鉴点：

- chat run 必须有 `runId/idempotencyKey`，支持 abort、dedupe、final/error event。
- 历史读取要有 max message 和 max bytes，避免 UI 被大消息拖垮。
- 大 payload 替换为 placeholder，不直接传给 renderer。
- session metadata 和 transcript 分离，利于重置和归档。

限制：

- JSONL transcript 适合 CLI/agent replay，但 Electron app 的会话列表、搜索、编辑、附件关系更适合 SQLite。
- 如果直接照搬，会把 gateway/agent 的复杂度带进桌面端。

## 对 Electron 的推荐实现

### 总体判断

推荐采用 AstrBot 的 UI 展示协议和 OpenAI messages 中间格式，结合 OpenOmniClaw 的 provider/model/auth 解耦与 runId 流式事件模型。

不建议直接复用 AstrBot 的 Quart REST/SSE 后端，也不建议直接搬 OpenOmniClaw gateway。Electron 应该使用：

- Renderer：继续保留当前 AstrBot chat UI 和 `message parts` 展示模型。
- Preload bridge：提供 typed IPC API。
- Main/core：新增 `ChatService` 作为编排层。
- Persistence：SQLite 持久化 session、message、attachment、provider、run。
- Provider：先实现 OpenAI-compatible `/chat/completions`，再扩展 Ollama、OpenRouter、OmniInfer。

### 推荐模块划分

建议新增或扩展以下模块：

- `core/chat/chat-service.ts`
  - 发送消息、创建 run、调用 context builder、调用 provider、写入消息状态、发布 stream event。
- `core/chat/session-manager.ts`
  - session CRUD、rename、delete、reset、pin/archive、当前 provider/model 设置。
- `core/chat/message-repo.ts`
  - message CRUD、分页查询、编辑、重新生成、checkpoint/branch 处理。
- `core/chat/attachment-service.ts`
  - Electron 文件选择/拖拽/粘贴接入、复制到 app data、MIME 嗅探、hash 去重、预览 URL、文本抽取。
- `core/chat/context-builder.ts`
  - 把 DB 中的 canonical messages 编译成 OpenAI messages，做 token/数量/附件策略裁剪。
- `core/chat/run-manager.ts`
  - runId、AbortController、并发锁、dedupe、stream event。
- `core/provider/provider-manager.ts`
  - provider/model CRUD、默认 provider、模型列表刷新、credential 解析。
- `core/provider/providers/openai-compatible.ts`
  - OpenAI compatible Chat Completions provider，使用 `fetch` 直接调接口。
- `core/db/*`
  - SQLite client、migration、repositories。

IPC 建议扩展为：

- `chat:listSessions`
- `chat:createSession`
- `chat:getSession`
- `chat:listMessages`
- `chat:sendMessage`
- `chat:abortRun`
- `chat:editMessage`
- `chat:regenerateMessage`
- `chat:uploadAttachment`
- `chat:getAttachmentUrl`
- `provider:list`
- `provider:upsert`
- `provider:delete`
- `provider:test`
- `provider:listModels`
- `provider:refreshModels`
- `provider:setSessionModel`

流式事件必须带 `runId/sessionId/messageId/seq`，不要再使用全局 `streamToken`，否则多个会话或多个窗口并发时会串流。

### Chat send 推荐链路

推荐发送消息链路：

1. Renderer 将输入框文本和 staged attachments 组成 `SendMessageRequest`。
2. Main 收到 IPC 后校验 session、provider、model、附件权限。
3. `AttachmentService` 确认附件已落盘，补齐 MIME、size、sha256、preview 信息。
4. `MessageRepo` 写入 user message，状态为 `complete`。
5. `MessageRepo` 创建 assistant message placeholder，状态为 `streaming`。
6. `RunManager` 创建 run，建立 `AbortController`，向 renderer 发 `started` event。
7. `ContextBuilder` 读取最近历史，按 provider/model 能力编译 OpenAI messages：
   - 文本 part -> `{ type: "text", text }`
   - 图片 part -> `{ type: "image_url", image_url: { url: dataUrl } }`
   - 普通文件 -> 抽取文本后插入 `<attachment>` 文本块
   - 不支持图片的模型 -> 降级为附件说明文本
8. `OpenAICompatibleProvider.streamChat()` 发起 `POST {baseUrl}/chat/completions`。
9. 每个 delta 更新 assistant message 的 parts，并发 IPC event。
10. 完成时保存 usage、finishReason、raw provider response 摘要，assistant message 状态改为 `complete`。
11. 异常时 assistant message 状态改为 `error`，保留已生成的 partial content。

### Provider 实现建议

MVP 先实现 OpenAI compatible Chat Completions：

- `baseUrl` 默认 `https://api.openai.com/v1`，但不要硬编码为 OpenAI 专属。
- 发送端拼接 `${baseUrl.replace(/\/$/, "")}/chat/completions`。
- 支持 `stream: true`。
- 支持 request 参数：`model/messages/temperature/top_p/max_tokens/tools/tool_choice`。
- 支持 provider/model 级 `headers` 和 `extraBody`。
- 支持 `GET /models` 刷新模型，如果失败允许手动配置模型。
- 支持模型能力声明：`text/image/file/audio/tools/reasoning/streaming`。

错误处理先做确定性逻辑：

- HTTP 401/403：credential invalid。
- HTTP 404：baseUrl 或 model 错误。
- HTTP 429：rate limited。
- context length：触发 context 裁剪后重试一次。
- unsupported image/tool：如果 provider 返回明确错误，可降级一次。

不要一开始复制 AstrBot 的大量字符串兼容逻辑。先把错误结构化保存到 run 和 message，后续按真实 provider 逐个补 compat。

### 附件实现建议

推荐附件策略：

- 所有附件都复制到 app data 目录，例如 `${app.getPath("userData")}/attachments/YYYY/MM/sha256.ext`。
- DB 记录 `attachment_id/path/original_name/mime/size/sha256/kind/status`。
- 消息只保存 `attachmentId`，不保存绝对路径给 renderer。
- Renderer 通过 `chat:getAttachmentUrl` 或自定义 `app://attachment/:id` 获取预览。
- 图片发送给支持 vision 的模型时，运行时读取文件并转 data URL。
- 文本类文件发送时抽取 UTF-8 文本，限制字符数，例如 100k。
- PDF 先 MVP 可只保存和显示，不抽取；后续再接 `pdfjs-dist`。
- 二进制非图片文件默认只注入文件名、大小、MIME，不把内容传给模型。
- 历史上下文中不长期保留图片 base64，只在当前 run 的 provider payload 中 materialize。

### 上下文与历史建议

建议使用一个 canonical message 表保存所有 UI 可见消息，并在运行时编译 provider messages，而不是单独保存一份 OpenAI history JSON。

原因：

- Electron 需要搜索、分页、编辑、附件关系、删除、导出，SQLite message 表更自然。
- OpenAI messages 是 provider 输入，不适合作为唯一的产品数据模型。
- 当前 UI 已经使用 AstrBot message parts，保留 message parts 可以降低迁移成本。

上下文编译策略：

- 每次发送前读取当前 session 最近 N 条 complete/partial messages。
- system prompt 从 session/provider/persona 配置注入。
- 跳过 `error`、`aborted`、`deleted` 消息，或转成简短说明。
- tool call/tool result 保持配对，配不齐时跳过或转文本。
- 按模型 `contextWindow` 做预算：
  - MVP：按字符估算，保留最近 turns。
  - 后续：引入 tokenizer，按 token 裁剪。
- 大附件只注入摘要或 placeholder。
- 后续可加 `context_snapshots` 或 `message_summaries` 支持长上下文摘要。

编辑和重新生成：

- user message 编辑只允许最新 turn，MVP 与 AstrBot 一致。
- 编辑后截断该 user message 之后的 assistant 消息，并创建新 run。
- assistant 重新生成删除或标记旧 assistant message 为 `superseded`，新建 sibling message。
- 为未来分支保留 `parentMessageId`、`rootMessageId`、`checkpointId`。

### Provider 管理建议

Provider 管理应当学习 OpenOmniClaw 的三层：

- Provider：服务端点与鉴权方式，例如 OpenAI、OpenRouter、Ollama、OmniInfer。
- Model：某 provider 下的模型元数据与能力。
- Credential：API key 或 token，单独存储，不直接暴露给 renderer。

推荐：

- provider 配置保存在 SQLite。
- API key 使用 Electron `safeStorage` 加密后保存，或接入 OS keychain。MVP 可先 `safeStorage`。
- 支持 `env` credential source，例如 `OPENAI_API_KEY`。
- 支持 provider test，发送轻量请求或列模型。
- 支持 provider/model enable/disable。
- 支持 session 级 model override，默认走 global default。

### 分阶段落地

第一阶段，替换 mock：

- 新增 SQLite 和 migrations。
- 实现 session/message/attachment/provider 基础 CRUD。
- IPC 替换 `/api/chat/sessions`、`/api/chat/get_session`、`/api/chat/send`。
- OpenAI compatible provider 能流式输出纯文本。

第二阶段，多模态和历史：

- 图片上传落盘和预览。
- vision model 的 image_url data URL 输入。
- 文件保存和文本抽取。
- 消息分页、搜索、删除、rename。
- session 级 provider/model 选择。

第三阶段，上下文管理和编辑：

- context window 裁剪。
- latest user edit 和 regenerate。
- abort run。
- usage 记录。
- provider `/models` 刷新。

第四阶段，增强能力：

- tool call 展示和执行。
- reasoning 标准化。
- 长上下文摘要。
- side thread/branch。
- auth profile、key failover、provider compat registry。

## 关键结论

1. AstrBot 适合借鉴消息分层：UI message parts、附件表、OpenAI messages 中间格式、checkpoint。
2. OpenOmniClaw 适合借鉴 provider 分层：provider/model/auth 解耦、capability metadata、runId event、history sanitization。
3. Electron 不应直接搬 REST/SSE/gateway，而应做 typed IPC 和本地 SQLite。
4. 当前 UI 迁移成果应保留，核心重写在 `core/chat`、`core/provider`、`core/db`。
5. 数据模型要从一开始支持附件、message status、runId、provider/model snapshot，否则后面做 abort、历史、重新生成会反复返工。
