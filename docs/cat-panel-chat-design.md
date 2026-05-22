# 小猫悬浮面板 Chat 设计

## 背景

当前悬浮球已有独立窗口和 panel 窗口，但 panel 仍是快捷控制面板。下一步希望让小猫成为可直接交互的桌面助手：

1. 拖动文件到悬浮球后，可以作为附件进入小猫对话。
2. Panel 可以显示多轮对话历史，相当于一个简化但完整的 chat 页面。
3. 小猫可以通过对话启动定时任务。
4. 定时任务完成后，小猫旁边弹出一个轻量气泡，显示任务完成提示和回复摘要。

本设计只描述产品与技术边界，不直接实现。

## 设计结论

- Panel 应设计为 **小猫专用 chat 页面**，不是仪表盘。
- 小猫 chat session 应新增独立类别 `cat`，并支持多个小猫会话，防止和主窗口普通 chat 混在一起。
- `cat` session 只是一种 session kind，不新建聊天核心链路；消息、run、附件、工具调用继续复用现有 `ChatService`、repo 和 stream event。
- Panel 的消息列表、输入框、附件、模型切换和流式状态应优先复用当前 chat 组件与 composable；只新增 panel 专用外壳和控制器。
- 定时任务完成提示应做成 **独立小气泡窗口**，由 main 收到 cron 完成事件后发 IPC/窗口事件展示。

## 信息架构

```text
悬浮球窗口
  ├─ 展示小猫状态
  ├─ 接收文件拖放
  └─ 打开/关闭 panel

小猫 Panel 窗口
  ├─ 当前小猫会话标题
  ├─ 右上角切换小猫会话
  ├─ 多轮消息历史
  ├─ 附件暂存与预览
  ├─ 输入框与发送/停止
  ├─ 模型/工具权限入口
  └─ 当前任务状态摘要

小猫通知气泡窗口
  ├─ 任务完成/失败提示
  ├─ 回复摘要前 N 字符
  └─ 查看结果 / 关闭
```

## Panel UI 与组件复用

Panel 作为一个简化完整 chat 页面，建议结构：

```text
┌──────────────────────────────┐
│ 小猫              switch/new │
│ cat session title / status   │
├──────────────────────────────┤
│ message history              │
│ user: ...                    │
│ cat: ...                     │
│ tool: future_task created    │
│ cat: ...                     │
├──────────────────────────────┤
│ staged attachments           │
├──────────────────────────────┤
│ model / tool profile         │
│ composer textarea      send  │
└──────────────────────────────┘
```

Panel 与主 Chat 页面能力差异：

| 能力 | Panel | 主 Chat |
|------|-------|---------|
| 多轮历史 | 必须支持 | 必须支持 |
| 发送/停止 | 必须支持 | 必须支持 |
| 附件 | 必须支持 | 必须支持 |
| 模型切换 | 必须支持，复用当前 chat 行为 | 完整支持 |
| 会话切换 | 右上角按钮切换 `cat` session | 侧栏切换普通 chat |
| 会话侧栏 | 不建议放入 MVP | 完整支持 |
| 消息编辑/引用/重新生成 | 后续可加 | 完整支持 |
| 任务列表管理 | 只显示当前相关摘要 | 设置页完整管理 |

Panel 初始尺寸可以大于当前快捷控制面板。建议 MVP 使用约 `420x560`，否则多轮历史和 composer 会互相挤压。

复用策略：

| 层级 | 做法 |
|------|------|
| 消息展示 | 复用 `ChatMessageList`、message part renderer、tool call card |
| 输入区 | 复用 `ChatComposer`，用 panel 外壳提供 props 和事件 |
| 附件 | 复用 `useMediaHandling` 和现有附件上传限制 |
| 流式消息 | 复用 `useMessages` 的发送、停止、stream event 处理 |
| 模型选择 | 复用当前 chat 的模型选项、session model 保存逻辑 |
| 主页面外壳 | 不直接复用 `ChatWorkspace`、`ChatComposerDock`、router home/chat 逻辑 |

推荐拆分：

```text
现有 chat 基础组件
  ├─ ChatMessageList
  ├─ ChatComposer
  ├─ useMessages
  ├─ useMediaHandling
  └─ model/tool profile helpers

主 Chat 页面
  └─ ChatWorkspace + Sidebar + Router

小猫 Panel 页面
  └─ CatPanelChatSurface + CatPanelChatController
```

这样 panel 不是重新设计一套聊天组件，而是复用当前 chat 能力，只新增适配独立 BrowserWindow、`cat` session 切换和紧凑布局的外壳。

## 小猫会话类别

建议新增 `ChatSessionKind = 'chat' | 'cat' | 'cron'`。

原因：

- 用户语义不同：小猫是桌面 companion，不是主窗口普通会话。
- 列表展示不同：主聊天侧栏默认不应混入小猫系统会话。
- 工具边界不同：小猫更偏任务、提醒、附件投递，默认 tool profile 可以与普通 chat 分开设计。
- Cron 归属更清楚：小猫创建的任务可以明确记录 `sourceSessionId` / `targetSessionId` 为 cat session。

约束：

- 不为 `cat` 新建 message 表、run 表或附件表。
- `cat` session 仍通过 `ChatService` 创建、加载、发送和流式订阅。
- 主窗口可以提供“打开小猫会话”入口，但普通会话列表默认过滤 `kind === 'cat'`。
- 小猫 panel 支持多个 `cat` session，在右上角提供“换一个会话”按钮。
- “换一个会话”打开紧凑 session switcher，只展示 `kind === 'cat'` 的会话，并提供新建小猫会话入口。
- Panel 当前会话的模型选择行为与主 chat 一致：用户可切换模型，选择后保存到当前 session。

不建议使用固定 `SYSTEM_SESSION_IDS.cat` 作为唯一小猫会话。Panel 应维护“当前小猫会话”：

- 首次打开 panel 时，如果没有 `cat` session，则创建一个新的 `cat` session。
- 再次打开 panel 时，优先恢复上次使用的 `cat` session。
- 用户点击右上角按钮后，可以切换到另一个 `cat` session 或新建一个 `cat` session。

启动 panel 时：

1. panel 加载 `kind === 'cat'` 的会话列表。
2. 恢复上次 active cat session；如果不存在则创建新 `cat` session。
3. panel 加载当前 cat session 的消息历史。
4. panel 发送消息时使用当前 active cat sessionId。
5. 切换 cat session 时，清理当前 staged attachments 或提示用户确认，避免附件误发到另一个会话。

## 附件拖放流程

拖放文件到悬浮球时，不能让 renderer 直接访问文件系统。流程应保持现有安全边界：

```text
用户拖文件到悬浮球
  ↓
cat window renderer 读取 File.arrayBuffer()
  ↓
appBridge.attachment.upload()
  ↓
main/core AttachmentService 落盘与抽取
  ↓
写入当前 active cat session 的 panel draft attachment refs
  ↓
打开/刷新 cat panel
  ↓
panel 展示 staged attachments
  ↓
发送消息时组装 ChatMessagePart attachment parts
```

MVP 行为：

- 拖入文件后自动打开 panel。
- Panel 顶部或 composer 上方展示附件队列。
- 用户可以继续输入文字后发送。
- 发送成功后清空 panel 的 staged attachments。
- 如果 panel 未打开，拖放目标使用上次 active cat session；如果不存在则创建新的 `cat` session。
- 如果上传失败，panel 使用现有 toast/错误状态展示，不静默失败。

限制沿用现有聊天附件限制：

| 项 | 限制 |
|----|------|
| 单文件大小 | 25MB |
| 单消息附件数 | 12 |

## 小猫启动定时任务

小猫通过普通 Agent 工具链创建任务，不走 panel 自定义业务规则。

```text
panel sendMessage
  ↓
ChatService
  ↓
Agent run
  ↓
future_task tool
  ↓
CronManager.create/update/delete/list
  ↓
CronTaskChangedEvent
```

注意：

- `future_task` 是 write 风险工具，应继续遵守工具权限和 approval 策略。
- 如果产品希望“小猫确认一句就创建任务”，应做任务专用确认 UI，而不是绕过 `ToolPolicy`。
- 小猫 session 默认 tool profile 建议为 `assistant`，因为 `minimal` 不包含 `future_task`。

## 任务完成气泡

任务完成提示单独做一个小气泡窗口，不复用 panel。

触发源：

```text
CronManager run completed/failed
  ↓
electron/main.ts broadcastCronChanged
  ↓
cat notification controller 判断是否需要展示
  ↓
创建或复用 cat notification BrowserWindow
  ↓
发送 CatNotificationEvent
  ↓
气泡展示摘要
```

气泡展示内容：

| 字段 | 说明 |
|------|------|
| status | 完成、失败、中断 |
| title | 任务名称 |
| summaryPreview | `CronRun.resultSummary` 前 80-160 字符 |
| taskId | 用于查看任务 |
| runId | 用于查看运行记录 |
| resultMessageId | 用于跳到结果消息 |

显示规则：

- 只对 `targetSessionId` 或 `sourceSessionId` 对应 `kind === 'cat'` 的任务自动弹出。
- 如果 panel 已打开，也可以在 panel 内插入一条任务完成提示，但气泡仍可作为桌面提醒。
- 气泡自动停留 6-10 秒。
- 鼠标悬停暂停关闭倒计时。
- 点击“查看结果”打开 panel，并切换到该任务绑定的 `cat` session。因为定时任务与 session 绑定，结果优先在对应小猫会话里查看。

气泡文案示例：

```text
任务完成
日报整理好了：今天新增 3 条待办，两个任务逾期...

[查看结果] [关闭]
```

失败文案示例：

```text
任务失败
日报整理没有完成：模型调用超时。

[查看记录] [关闭]
```

## IPC 与类型变更范围

实现时需要同步这些契约：

| 变更 | 落点 |
|------|------|
| 扩展 `ChatSessionKind` | `shared/types/chat.ts` |
| 创建 session 时支持指定 `kind: 'cat'` | `shared/types/chat.ts`、`core/chat/chat-service.ts`、`electron/ipc/chat.ts` |
| 新增 cat draft / notification payload 类型 | `shared/types/cat.ts` |
| 新增 cat panel draft IPC channel | `shared/constants.ts`、`electron/preload.ts`、`src/bridge/app.ts` |
| cat session 列表、active session 恢复与切换 | `src/catwindow/CatPanelApp.vue` 及拆出的 composable |
| cat panel 加载消息和发送消息 | 复用 chat 组件/composable，新增 panel controller |
| cron 完成气泡窗口 | `electron/cat-window.ts` 或独立 cat notification controller |
| 主聊天列表过滤 cat session | `src/composables/useSessions.ts` / 侧栏调用点 |

## 实现分期

### Phase 1：小猫完整 chat MVP

- 新增 `cat` session kind，并支持创建多个 cat session。
- Panel 显示当前 cat session 多轮历史。
- Panel 右上角支持切换 cat session 和新建 cat session。
- Panel 支持发送、停止、流式更新。
- Panel 支持附件 staged list，但文件拖放可先只在 panel 内支持。
- Panel 复用当前 chat 消息列表、输入框、附件和模型切换能力。

### Phase 2：悬浮球拖放附件

- 悬浮球窗口支持 drag/drop。
- 拖入后上传附件并打开 panel。
- 通过 cat draft 事件把附件传给 panel。
- 完成发送后清理 draft。

### Phase 3：Cron 完成气泡

- 根据 `CronTaskChangedEvent` 触发气泡窗口。
- 气泡显示任务名称、完成状态和摘要。
- 支持查看结果和关闭；查看结果打开 panel，并切换到任务绑定的 cat session。

### Phase 4：体验增强

- Panel 内展示当前任务卡片。
- 支持任务确认 UI。
- 支持从主窗口或通知跳转到指定小猫会话。
- 支持小猫会话归档/清空历史。

## 验收标准

- Panel 可以加载并展示小猫多轮历史。
- Panel 发送消息后，消息持久化到 `cat` session。
- Panel 可以在多个 `cat` session 之间切换，并按 session 保存模型选择。
- 主聊天列表默认不混入小猫会话。
- 拖入附件后，附件通过 `AttachmentService` 上传，不绕过 main/core。
- 小猫创建的定时任务能记录到 cat session 归属。
- Cron run 完成后，main 能触发小猫气泡提示。
- 气泡只展示摘要，不展示完整 prompt、附件正文、Provider 响应体或敏感信息。
- 所有新增 IPC 通过 `appBridge`，renderer 不直接访问 Node/Electron API。

