# OmniClaw 聊天界面移植总结

本文档总结当前从 AstrBot Dashboard 移植到 OmniClaw Electron 的聊天界面范围、已完成适配、后续接入 `core` 能力需要补全的接口，以及建议重写的代码区域。

## 一、已完成的移植范围

### 1. 聊天主界面

已将 AstrBot 的聊天入口迁移为 OmniClaw 当前主页面：

- `src/views/ChatView.vue` 现在直接渲染 `src/components/chat/Chat.vue`。
- `/chat/:conversationId?` 与 `/chatbox/:conversationId?` 路由已接入，根路由 `/` 重定向到 `/chat`。
- `src/App.vue` 改为 Vuetify 全屏应用容器，不再使用旧的左侧 rail 导航。

当前聊天页包含：

- 左侧聊天历史侧边栏
- 新建对话入口
- 模型配置入口占位
- 项目列表 UI
- 会话重命名、删除 UI
- 中央消息流区域
- 空会话欢迎态
- 底部输入框
- 附件上传 UI
- 模型选择 chip
- 语音按钮占位
- 停止生成/发送按钮
- 设置中心弹窗

### 2. 消息渲染相关组件

已复制并接入 AstrBot 的消息渲染组件闭包：

- `ChatMessageList.vue`
- `MarkdownMessagePart.vue`
- `ThreadedMarkdownMessagePart.vue`
- `ReasoningBlock.vue`
- `ReasoningTimeline.vue`
- `ToolCallCard.vue`
- `ToolCallItem.vue`
- `IPythonToolBlock.vue`
- `RefNode.vue`
- `RefsSidebar.vue`
- `ThreadNode.vue`
- `ActionRef.vue`

因此当前 UI 已具备以下展示能力：

- 用户/助手消息气泡
- Markdown 渲染
- 代码块渲染
- 推理过程折叠展示
- Tool Call 卡片展示
- Python/IPython 工具结果展示
- 引用来源展示
- 分支/thread UI
- 消息编辑、复制、重新生成等按钮 UI

### 3. 输入框与交互组件

已迁移：

- `ChatInput.vue`
- `ConfigSelector.vue`
- `ProviderModelMenu.vue`
- `RegenerateMenu.vue`
- `ProjectDialog.vue`
- `ProjectList.vue`
- `ProjectView.vue`
- `ThreadPanel.vue`
- `ReasoningSidebar.vue`

并完成以下适配：

- 输入框品牌文案从 `AstrBot` 改为 `OmniClaw`。
- 设置入口从 AstrBot 原先的菜单改为中心 modal。
- 侧边栏断点从 Vuetify 默认 `lgAndUp` 调整为 `mdAndUp`，适配 Electron 默认窗口宽度。
- 修复侧边栏覆盖主内容的问题：桌面宽度下主内容会按侧边栏宽度偏移。

### 4. UI 依赖与主题

已引入并配置：

- `vuetify`
- `axios`
- `axios-mock-adapter`
- `markstream-vue`
- `markdown-it`
- `shiki`
- `mermaid`
- `katex`
- `dompurify`
- `@mdi/font`
- AstrBot 的 MDI subset 字体资源
- AstrBot 的 light/dark theme 结构

新增：

- `src/plugins/vuetify.ts`
- `src/theme/LightTheme.ts`
- `src/theme/DarkTheme.ts`
- `src/types/themeTypes/ThemeType.ts`
- `src/stores/customizer.ts`

### 5. i18n 与品牌替换

已迁移 AstrBot 的 i18n 文件，并将 `src` 内所有 `AstrBot/astrbot` 替换为 `OmniClaw/omniclaw`。

当前已无：

```bash
rg "AstrBot|astrbot" src
```

匹配结果。

相关改动包括：

- 欢迎语改为 `欢迎使用 OmniClaw`
- 输入框 placeholder 改为 `Ask OmniClaw...`
- localStorage key 改为 `omniclaw-locale`
- i18n event 改为 `omniclaw-locale-changed`

### 6. 本地 Mock API

为了让 AstrBot 的 REST/SSE 调用在当前 Electron 项目中先跑起来，新增：

- `src/api/omniclawMock.ts`

当前 mock 覆盖：

- `/api/chat/sessions`
- `/api/chat/new_session`
- `/api/chat/delete_session`
- `/api/chat/get_session`
- `/api/chat/send`
- `/api/chat/stop`
- `/api/chat/message/edit`
- `/api/chat/message/regenerate`
- `/api/config/provider/list`
- `/api/config/abconfs`
- `/api/chatui_project/*`
- `/api/chat/thread/*`
- `/api/chat/post_file`
- `/api/chat/get_file`

该 mock 只用于 UI 移植阶段，后续应全部替换为 Electron IPC + `core` 实现。

### 7. Electron 启动适配

已处理当前环境中 `ELECTRON_RUN_AS_NODE=1` 导致 Electron 主进程 API 不可用的问题：

- `package.json` 的 `dev` 和 `start` 脚本使用 `env -u ELECTRON_RUN_AS_NODE ...`。
- `electron/main.ts` 改为标准 Electron import。

## 二、当前仍是占位或 Mock 的部分

### 1. 会话与消息数据

当前会话、消息历史、流式回复都来自 `src/api/omniclawMock.ts`。

尚未接入：

- `core/chat/session-manager.ts`
- `core/chat/context-manager.ts`
- `core/chat/stream-handler.ts`
- `core/db/repos/session-repo.ts`
- SQLite 持久化消息历史
- 真实 provider 推理响应

### 2. Provider 配置

当前 provider 列表是 mock：

```ts
omniinfer-local / local-small-model
```

尚未接入：

- `core/provider/manager.ts`
- `core/provider/providers/openai.ts`
- Provider 配置持久化
- API Key 管理
- Base URL 管理
- 模型列表拉取或手工维护
- 当前 provider/model 的真正选择逻辑

### 3. 设置弹窗

设置弹窗目前只有基础占位：

- 传输模式
- 语言
- 主题切换
- 更多基础设置占位

尚未接入：

- Provider 设置
- 上下文窗口设置
- 小模型优化参数
- Skill 开关
- Cron 设置
- 数据目录/缓存设置
- 桌面端行为设置

### 4. 文件与媒体上传

当前附件上传走 mock：

- 图片/文件只保存在 renderer 内存中。
- 没有落盘。
- 没有传给 LLM provider。
- 没有权限控制。

需要接入：

- Electron 文件选择与安全路径授权
- 本地附件存储
- 消息附件表
- 图片/文件转 provider input 的适配

### 5. 语音输入

UI 上保留了麦克风按钮，但没有真实 STT/TTS 能力。

后续需要明确：

- 是否 MVP 保留占位
- 是否接入本地 Whisper / Web Speech / Provider STT
- 录音权限与音频文件生命周期

### 6. Thread / Reasoning / Refs

UI 已迁移，但数据层仍是 mock 或空实现。

需要补：

- thread 的真实创建、查询、删除、发送
- reasoning chunk 的 provider streaming 协议
- refs 的来源结构定义
- web search / RAG refs 注入

## 三、接入 Core 需要补全的能力

### 1. IPC API 设计

建议不要继续保留 AstrBot 风格 REST API 作为长期方案。Electron 项目应以 preload 暴露安全 IPC API：

```ts
window.openOmniClaw.chat.listSessions()
window.openOmniClaw.chat.createSession()
window.openOmniClaw.chat.loadMessages(sessionId)
window.openOmniClaw.chat.sendMessage(request)
window.openOmniClaw.chat.stop(sessionId)
```

需要新增或扩展 shared types：

- `ChatSession`
- `ChatMessage`
- `MessagePart`
- `ToolCallPart`
- `ReasoningPart`
- `AttachmentPart`
- `ChatStreamEvent`
- `ProviderSelection`

### 2. Chat Core

需要让 `core/chat` 提供完整对话生命周期：

- 创建会话
- 查询会话列表
- 删除会话
- 重命名会话
- 查询消息历史
- 写入用户消息
- 调用 provider
- 流式写入 assistant 消息
- 停止生成
- 重新生成
- 编辑用户消息并截断后续消息

重点是定义统一流式事件：

```ts
type ChatStreamEvent =
  | { type: 'message_started'; messageId: string }
  | { type: 'text_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'tool_call_started'; toolCall: ToolCall }
  | { type: 'tool_call_delta'; toolCallId: string; delta: unknown }
  | { type: 'tool_call_finished'; toolCallId: string; result: unknown }
  | { type: 'message_finished'; messageId: string }
  | { type: 'error'; message: string }
```

然后由 UI composable 转成当前 `ChatRecord` 渲染结构。

### 3. DB 持久化

需要补全 SQLite schema 与 repo：

- sessions
- messages
- message_parts
- attachments
- provider_profiles
- skill_settings
- cron_tasks
- cron_logs

当前 `core/db/repos/session-repo.ts` 只应作为起点，需要覆盖消息与附件。

### 4. Provider Core

需要补全 OpenAI 兼容 provider：

- 非流式调用
- SSE 流式调用
- model selection
- tool calling
- reasoning content 兼容
- 多模态 input 兼容
- 错误归一化
- abort/stop

ProviderManager 需要支持：

- list
- create/update/delete
- enable/disable
- select active provider
- select active model
- test connection

### 5. Context Manager

需要实现 PRD 中的小模型友好上下文策略：

- 保留最近 N 轮
- 按 token budget 裁剪
- 系统 prompt 注入
- 工具描述精简
- 历史摘要压缩
- 附件/refs 上下文注入

UI 设置中需要暴露：

- 最大上下文轮数
- token budget
- 是否启用摘要
- 摘要模型/provider

### 6. Skill Core

需要将 UI 中 Tool Call 展示与 `core/skill` 打通：

- Skill 注册
- Skill 启用/禁用
- Skill 参数 schema
- Skill 执行
- Tool Call streaming event
- Tool result 持久化

内置 Skill 建议先做：

- system_time
- clipboard_read
- clipboard_write
- file_read
- web_search

### 7. Cron Core

需要让定时任务能够向指定 session 注入 prompt：

- 创建任务
- 编辑任务
- 启停任务
- 删除任务
- 手动触发
- 执行日志
- 系统通知

UI 可以后续复用当前页面风格，不建议从 AstrBot 继续大规模复制。

## 四、建议后续重写的代码

当前迁移的主要目标是快速拿到成熟 UI。后续如果要进入产品化，应逐步重写以下区域。

### 1. `src/composables/useMessages.ts`

这是最需要重写的文件。

原因：

- 当前强依赖 AstrBot REST endpoint。
- 同时混合数据获取、SSE 解析、消息归一化、媒体解析、编辑、重试、thread 等逻辑。
- 与 Electron IPC/Core 边界不清晰。

建议拆为：

- `useChatSessions`
- `useChatMessages`
- `useChatStreaming`
- `useMessageParts`
- `useAttachments`

并让它们只调用 `appBridge.chat.*`。

### 2. `src/composables/useSessions.ts`

需要重写为 Electron-native session composable。

当前问题：

- 使用 `/api/chat/sessions`
- 带有 AstrBot webchat/platform 概念
- 与 URL 路由强耦合

建议保留 UI 所需字段，但类型改为 OmniClaw 自己的 `ChatSession`。

### 3. `src/composables/useProjects.ts`

项目功能可以保留 UI，但数据层应重写。

需要判断产品上是否真的保留“项目”概念。如果保留，应进入 core/db；如果不保留，可以从 UI 中移除，降低复杂度。

### 4. `src/components/chat/ConfigSelector.vue`

建议重写。

当前组件来自 AstrBot 的配置文件/路由配置系统，不适合 OmniClaw 桌面端。

应替换为：

- Provider profile selector
- Persona/system prompt selector
- Skill preset selector

### 5. `src/components/chat/ProviderModelMenu.vue`

建议部分重写。

UI 可以保留，但数据源应改为：

- `appBridge.provider.list()`
- `appBridge.provider.getModels(providerId)`
- 当前 session 的 provider/model selection

### 6. `src/api/omniclawMock.ts`

必须删除。

它只是迁移期兼容层。Core 接入完成后，应移除所有 mock REST endpoint。

### 7. i18n 大量 AstrBot 原始模块

虽然已经统一改为 OmniClaw，但其中很多模块并非当前产品需要：

- platform
- alkaid
- extension marketplace
- authentication
- dashboard
- trace
- knowledge-base 的 AstrBot 语义

建议后续清理为 OmniClaw 最小 i18n 集：

- common
- chat
- settings
- provider
- skills
- cron
- errors

### 8. Markdown/Tool 渲染组件

可以先保留，但建议长期收敛：

- 去掉未使用的 thread/ref/action extension
- 明确 tool call schema
- 将 Python/IPython 专属展示改成通用 Skill execution 展示
- 控制 `mermaid/katex/shiki` 的按需加载，降低包体

### 9. SettingsView / SkillsView / CronView

目前主应用转为聊天页后，这些旧页面已经不是主入口的一部分。

建议：

- 设置统一进入中心 modal。
- Skills/Cron 后续可以做成 modal tab 或独立 secondary workspace。
- 不建议继续保留旧的 placeholder 页面作为主要产品形态。

## 五、推荐下一步实施顺序

### Phase 1：去 Mock，接入真实会话与消息

1. 设计 shared chat types。
2. 扩展 preload bridge。
3. 实现 `core/chat` 的 session/message CRUD。
4. 用 SQLite 持久化 session/message。
5. 重写 `useSessions` 和 `useMessages` 的数据层。

### Phase 2：接入 OpenAI 兼容 Provider

1. 完成 Provider 配置持久化。
2. 实现 OpenAI compatible streaming。
3. 将 `/api/chat/send` mock 替换为 `appBridge.chat.sendMessage`。
4. 打通停止生成。
5. 打通 provider/model selector。

### Phase 3：上下文与小模型优化

1. 实现 token budget 裁剪。
2. 实现最近 N 轮策略。
3. 实现摘要压缩。
4. UI 设置中暴露核心参数。

### Phase 4：Skill 与 Tool Call

1. 定义 Skill schema。
2. 接入 core/skill manager。
3. 将 tool call event 映射到当前消息渲染。
4. 重写 ToolCallCard 为 OmniClaw Skill 语义。

### Phase 5：清理 AstrBot 架构遗留

1. 删除 mock REST 层。
2. 删除未使用 i18n 模块。
3. 删除平台/UMO/ABConfig 相关逻辑。
4. 精简依赖与包体。
5. 将设置、技能、定时任务统一到 OmniClaw 桌面端交互模型。

## 六、当前验证状态

已经通过：

```bash
pnpm typecheck
pnpm build
```

已用 Playwright 验证：

- 聊天页可渲染
- 侧边栏默认展开
- 主内容响应侧边栏宽度
- 设置 modal 可打开
- mock 流式消息可显示

