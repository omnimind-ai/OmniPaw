# 主动视觉能力调研

## 背景

目标是让 OpenOmniClaw 具备“在用户同意后主动观察并反应”的能力。例如：用户允许后，使用支持多模态输入的模型查看当前屏幕截图，理解用户正在做什么，并给出轻量 reaction、提醒或建议。

这个能力不应等同于隐式监控。推荐把它拆成两层：

- **主动触发**：什么时候唤醒 agent，例如定时、用户允许的观察窗口、用户长时间停留、手动“看一眼屏幕”。
- **视觉观察**：在明确授权范围内截图，把截图作为图片上下文交给支持 image input 的模型。

## 需求收敛

当前更适合做成 **设置中的能力开关 + 会话内限时启动**，而不是默认常驻 agent。

推荐产品形态：

- 设置页提供“主动视觉观察”能力设置，默认关闭。
- 设置页只定义能力是否可用、默认观察间隔、默认时长、截图范围、是否允许外部 API、数据保留策略等默认值。
- 模型配置里建议增加两个可选模型引用：视觉观察模型和 reaction 模型。用户只配一个多模态模型时由它完成截图理解和 reaction；用户分别配置时，由视觉模型先描述截图，再把结构化观察摘要交给 reaction 模型生成反应。
- 真正开始观察必须由用户在当前聊天或猫窗口里显式启动一个“观察会话”。
- 观察会话不建议作为新的 `ChatSessionKind`。它是绑定到当前 `chat` 或 `cat` session 的 runtime 授权状态；reaction 可以显示在小猫气泡里，但记录和上下文仍归属目标 session。
- 观察会话是限时的，例如 5 分钟、15 分钟、30 分钟，到期自动停止；也必须提供立即停止入口。
- 观察方式是 **定时截图**，不是连续录屏，也不采集音频。
- 第一版可以提供“立即触发一次”按钮，用来验证整条链路；这个按钮不是单独 MVP，可以随完整能力一起做。后续可以保留为高级/调试入口，或在产品稳定后隐藏。

推荐第一版目标：

```text
设置中开启能力
  -> 当前会话启动限时观察
  -> ObservationManager 按间隔截图
  -> 视觉模型生成截图观察摘要
  -> reaction 模型生成候选反应
  -> Reaction Gate 判断 silent / ambient / chat
  -> 到期或用户停止后关闭观察
```

关于安全策略，本轮倾向采用 **前置明确授权**，而不是每次截图 ask-first。每次 ask-first 会消解主动性；但对于外部 API，需要更明确的前置告知和二次确认。

## 1. MaiBot 和 AstrBot 的主动能力实现

### MaiBot

相关代码：

- `MaiBot/src/maisaka/runtime.py`
- `MaiBot/src/maisaka/reasoning_engine.py`
- `MaiBot/src/maisaka/builtin_tool/__init__.py`
- `MaiBot/src/maisaka/builtin_tool/continue_tool.py`
- `MaiBot/src/maisaka/builtin_tool/no_action.py`
- `MaiBot/src/maisaka/builtin_tool/wait.py`
- `MaiBot/src/maisaka/builtin_tool/reply.py`
- `MaiBot/src/chat/heart_flow/heartflow_message_processor.py`

MaiBot 的当前主动能力核心不是一个简单 cron，而是会话级运行时中的“消息触发 + timing gate + planner + tool loop”。

简化流程：

```text
入站消息
  -> register_message 缓存消息
  -> internal turn queue
  -> Timing Gate 决定 continue / no_action / wait
  -> Planner 决定调用 reply / memory / image / custom tools
  -> replyer 生成可见回复并发送
```

关键点：

- `MaisakaHeartFlowChatting` 为每个 session 维护 `_internal_turn_queue`、消息缓存、运行状态、wait 超时任务和强制 continue 状态。
- `register_message()` 收到新消息后会缓存并调度下一轮 turn；如果 planner 正在跑，还能通过 interrupt flag 打断 planner，让新消息合并进下一轮决策。
- 独立 `Timing Gate` 先决定是否继续行动。可用动作包括 `continue`、`no_action`、`wait`。`no_action` 会停止思考等待新消息，`wait` 会进入等待状态并在超时后再判断。
- `Planner` 才负责真正行动，使用工具调用 `reply`、`send_image`、`query_memory`、`query_person_profile` 等。
- `enqueue_proactive_task()` 是插件主动唤醒入口：插件传入 intent/reason/metadata，运行时把它注入为一条特殊上下文 `<plugin_proactive_task>`，设置下一轮强制 continue，并向内部队列投递 `proactive` 触发。
- MaiBot 的视觉能力主要体现在聊天历史中的图片/表情按需回填、识图占位刷新，以及多模态 planner/replyer 的上下文构造，不是桌面屏幕观察。

可借鉴点：

- 主动任务不直接“发言”，而是先作为一条特殊上下文进入 agent，让模型自行决定是否回复。
- 在行动前增加门控层，避免每个触发都变成打扰用户。
- 对 `wait/no_action/continue` 建模为工具，使模型的主动性可解释、可记录、可测试。

### AstrBot

相关代码：

- `AstrBot/astrbot/core/cron/manager.py`
- `AstrBot/astrbot/core/cron/events.py`
- `AstrBot/astrbot/core/tools/cron_tools.py`
- `AstrBot/astrbot/core/tools/message_tools.py`
- `AstrBot/astrbot/builtin_stars/astrbot/main.py`
- `AstrBot/astrbot/builtin_stars/astrbot/long_term_memory.py`
- `AstrBot/astrbot/core/tools/computer_tools/cua.py`
- `AstrBot/astrbot/core/tools/registry.py`

AstrBot 有三类主动能力：

1. **群聊主动回复**
   - `LongTermMemory.need_active_reply()` 根据配置判断是否主动回复：仅群聊、非唤醒命令、可选白名单、按概率触发。
   - `Main.on_message()` 在需要主动回复时，用当前群聊历史、图片 caption 和当前消息发起 LLM 请求。
   - 这是“被消息触发的主动插话”，不是无事件后台观察。

2. **未来任务 / Cron 唤醒**
   - `FutureTaskTool` 暴露 `future_task` 工具，模型可以创建、编辑、删除、列出任务。
   - `CronJobManager` 使用 APScheduler 管理 `basic` 和 `active_agent` 两类任务。
   - `active_agent` 到点后会构造 `CronMessageEvent`，这是一个 synthetic event，并设置 `is_at_or_wake_command = True`、`is_wake = True`。
   - `_woke_main_agent()` 会补充历史、注入 proactive cron system prompt，并强制给本轮 agent 加上 `SendMessageToUserTool`，让 agent 能主动把结果发回目标 session。

3. **主动发消息工具**
   - `SendMessageToUserTool` 支持向当前或指定 session 发送 plain/image/file 等组件。
   - 发往其他 session 需要管理员权限。
   - `tools/registry.py` 会根据平台配置判断 `send_message_to_user` 是否可用，避免平台不支持主动消息时暴露无效工具。

AstrBot 也有 CUA sandbox 截图工具：

- `CuaScreenshotTool` 从 CUA sandbox 获取 screenshot，可选择发给用户，也可把图片内容返回给 LLM。
- 截图工具需要管理员权限，并且只在 sandbox CUA 配置满足时注册。
- 这个实现针对 sandbox GUI，不是用户真实桌面，但“截图作为工具结果返回给多模态模型”的形态值得借鉴。

可借鉴点：

- 用 synthetic event / synthetic message 唤醒主 agent，而不是绕开主 agent 流程。
- future task 与主动消息工具分离：任务只负责唤醒，发送仍通过工具/agent 决策。
- 对高敏感工具做配置门控和权限检查。

## 2. OpenOmniClaw 可以怎么实现

### 当前项目已有基础

OpenOmniClaw 已经具备几块可复用能力：

- 聊天主入口：`core/chat/chat-service.ts`
- Agent runner：`core/agent/agent-runner.ts`
- 工具注册/执行/策略：`core/agent/tools/*`
- 计划任务：`core/cron/cron-manager.ts`、`core/cron/scheduled-task-executor.ts`
- `future_task` 工具：`core/agent/tools/builtin-tools.ts`
- 图片附件和上下文拼装：`core/chat/attachment-service.ts`、`core/chat/context/attachments.ts`
- Provider/model capability：`shared/types/provider.ts` 里已有 `input: ['text', 'image', ...]`
- Electron IPC 边界：renderer 只能通过 `appBridge`，不能直接访问 Node/Electron/文件系统。

因此不需要从零做一个主动 agent 系统。建议复用现有 cron、agent tool、attachment、provider capability 和 run/message 结构。

### 建议架构

```text
Renderer UI
  - 设置页能力开关和默认值
  - 会话内启动/停止限时观察
  - 立即触发一次
  - 显示正在观察状态和剩余时间
        |
        v
preload/appBridge
        |
        v
electron/ipc/observation.ts
        |
        v
core/observation/ObservationManager
        |
        +-- injected DesktopCaptureAdapter
        |     - Electron main 侧调用 desktopCapturer
        |
        +-- AttachmentService
        |     - 临时保存截图或创建内部图片附件
        |
        +-- ProviderManager / AgentRunner
        |     - 解析 visionModelRef / reactionModelRef
        |     - 执行截图理解和 reaction 生成
        |
        +-- ChatService / ObservationEventBus
              - 把观察摘要或 reaction 归属到目标 session
              - 必要时由 Electron runtime 转发小猫 ambient reaction
```

边界建议：

- `desktopCapturer` 只能放在 Electron main 侧，不能让 `core/` 直接 import Electron。
- `core/observation` 只依赖一个接口，例如 `captureScreen(request): Promise<CapturedFrame>`，具体实现由 `electron/core-runtime.ts` 注入。
- renderer 只提交用户授权、选择范围和显示状态，不接触原始截图 bytes。
- 截图默认走临时内部附件，不写日志，不进入 request snapshot 原文。
- 设置页保存的是默认策略，不代表能力开始运行；运行中的观察会话只保存在 runtime 状态中，应用重启后默认不恢复。

Electron 官方文档要点：

- `desktopCapturer` 是 Main process API，可列出 `screen` / `window` source，并返回可捕获 source。
- macOS 10.15+ 屏幕捕获需要系统授权，可用 `systemPreferences.getMediaAccessStatus('screen')` 检测。
- `systemPreferences.askForMediaAccess()` 只覆盖 camera/microphone，不能直接弹出 screen 授权；屏幕授权通常由实际捕获或系统设置流程触发。

### 第一版：完整链路加立即触发按钮

不需要把“一次性截图观察”做成单独可丢弃的 MVP。更合适的做法是先实现完整观察链路，同时提供一个“立即触发一次”按钮验证链路。

第一版闭环：

1. 用户在设置页开启“主动视觉观察”。
2. 用户在当前会话点击“开始观察”，选择时长、间隔、截图范围和输出方式。
3. 如果视觉模型或 reaction 模型来自外部 API，或者无法判断是否本地，UI 给出外部 API 风险确认。
4. main 侧检查屏幕录制权限。
5. `ObservationManager` 启动限时观察会话，并按配置间隔触发截图。
6. “立即触发一次”按钮调用同一条执行路径，只是跳过等待下一个 interval。
7. main 侧截图，写入临时图片附件或内部图片资源。
8. 创建一条内部 user message，例如：

```text
<screen_observation>
用户授权你查看一张当前屏幕截图。请描述你看到的关键状态，并给出简短 reaction 或建议。
</screen_observation>
```

9. 通过 ProviderManager/AgentRunner 把截图发送给解析出的视觉模型。
10. 如果配置了拆分模型，先让视觉模型生成结构化观察摘要，再把摘要、目标 session 上下文和小猫 persona 交给 reaction 模型。
11. Reaction Gate 决定本次结果是静默、猫窗口 ambient reaction，还是写入聊天。

这样可以避免做完一次性 MVP 后再重构。立即触发按钮可以保留为“观察一次”能力；如果产品上嫌打扰，可以在功能稳定后隐藏到高级设置或开发开关。

### 第二步：截图工具

增加内置工具 `screen_observe`：

- `risk: 'read'`，但标记为敏感 read。
- 只在 `assistant` / `power` profile 暴露，`minimal` 不暴露。
- 不默认对普通聊天模型开放。第一版更推荐由 `ObservationManager` 调用截图能力，而不是让模型随意调用。
- 如果后续暴露给模型工具调用，则必须受观察会话授权约束：只有用户已启动限时观察会话时，模型才能在该会话内调用；会话外调用需要拒绝或要求用户先启动观察。
- 工具参数：
  - `scope`: `primary_display` / `selected_display` / `selected_window`
  - `reason`: 模型为什么要看屏幕
  - `returnImageToModel`: 默认 true
  - `persist`: 默认 false

工具返回结构建议：

```json
{
  "ok": true,
  "captureId": "...",
  "mimeType": "image/png",
  "width": 1440,
  "height": 900,
  "createdAt": 1760000000000,
  "retention": "ephemeral"
}
```

图片本体通过 provider image part 进入模型，不进入日志文本。

### 限时观察会话

当用户明确打开“主动观察”后，再允许后台触发：

- 观察会话有固定时长，例如 5 分钟、15 分钟、直到手动停止。
- UI 必须有常驻状态指示和停止按钮。
- 每次截图有最小间隔、每日上限、连续失败熔断。
- 默认只观察当前显示器或用户选择的窗口，不默认全屏全显示器。
- 截图不默认持久化，除非用户选择“把观察保存到会话”。

是否复用现有计划任务：

- 不建议把每个限时观察会话建成用户可见的 `CronTask`。观察会话高频、短生命周期、隐私敏感，写入计划任务列表会造成 UI 污染，也会带来应用重启后是否恢复观察的安全问题。
- 建议 `ObservationManager` 自己维护 runtime interval timer。应用退出或重启后，观察会话默认停止，不自动恢复。
- 可以复用现有计划任务的设计经验：synthetic message、run 状态、执行器、misfire 思路、`run now` 模式。
- 如果未来用户明确需要“每天 9 点观察屏幕并总结”，那应该作为单独的持久化计划任务类型，并要求更强的外部 API 风险确认；这不放进第一版。

触发器第一版只做两类：

- 定时触发：观察会话按间隔截图。
- 立即触发：用户点击“立即观察一次”，走同一条执行路径。

不要第一版就做键盘鼠标监听、全局活动分析或自动恢复后台观察。

### 观察会话与 `session.kind`

当前 `ChatSessionKind` 已经有 `chat`、`cat`、`cron`。第一版不建议新增 `observation` kind。

推荐建模：

```text
ObservationRun
  - id
  - targetSessionId
  - targetSessionKind: chat | cat
  - surface: cat | chat | none
  - startedAt / expiresAt / intervalMs
  - model refs / privacy policy / retention
```

这样“限时观察会话”只是运行态授权和计时器，不是一个新的聊天会话。原因：

- `cat` 已经是桌面 companion 的会话语义，主动 reaction 如果以小猫弹窗出现，应优先归属到 active cat session。
- 主 chat 启动的观察也需要归属当前 chat session，否则用户后续很难追溯“这是哪次对话触发的观察”。
- `observation` kind 会引入第四类会话列表、历史、上下文、模型选择和权限边界，第一版收益不够。
- 观察运行态默认不持久化，应用重启后停止；这与 `ChatSession` 的长期历史语义不一致。

交互建议：

- 从小猫窗口启动观察：`targetSessionKind = 'cat'`，`targetSessionId` 是当前 active cat session，ambient reaction 直接通过小猫气泡或 panel 展示；如果输出模式是 `chat`，则写入同一个 cat session。
- 从主聊天启动观察：`targetSessionKind = 'chat'`，`targetSessionId` 是当前 chat session；如果输出模式是 `ambient`，可以借小猫气泡展示，但气泡 payload 必须带 `targetSessionId`，点击后回到来源会话。
- 只需要把观察结果写入历史时，才创建普通 assistant message，并在 metadata 标记 `source: 'observation'`、`observationRunId`、`captureId`。静默或 ambient 反应可以只走事件，不落消息。

和小猫通信建议复用现有 cat window / cat panel 边界：

- `ObservationManager` 不直接操作小猫窗口。它只产出 `ObservationReactionEvent`，包含 `targetSessionId`、`targetSessionKind`、`surface`、`text`、`decision`、`observationRunId`。
- Electron main 侧 observation IPC 或 runtime 订阅这个事件；当 `surface = 'cat'` 时，路由到 `electron/cat-window.ts` 的小猫通知/面板通道。
- 如果需要打开小猫 panel 或切换会话，继续使用已有 `catPanel.open`、`catPanel.setActiveSession`、active cat session 同步机制。
- 如果 reaction 来自主 chat，但展示在小猫气泡里，气泡动作应回到原 `targetSessionId`，不要偷偷切换 active cat session。

如果未来确实需要“观察日志中心”或审计列表，可以新增 observation event 表，而不是先把它塞进 `ChatSessionKind`。

### 主动 reaction 策略

不要让每次截图都直接发言。建议增加一个轻量决策层：

```text
capture -> vision summary -> reaction candidate -> reaction gate -> visible reaction
```

`reaction gate` 判断：

- 用户是否允许当前观察会话发言。
- 距离上次 reaction 是否足够久。
- 截图变化是否有意义。
- reaction 是否会打断用户。

输出可以分级：

- `silent`: 只更新内部观察摘要。
- `ambient`: 猫窗口短 reaction，不写入聊天。
- `chat`: 写入目标 `chat` 或 `cat` session。
- `ask`: 先询问用户是否需要帮助。

这一层类似 MaiBot 的 Timing Gate：先决定是否行动，再进入回复生成。

第一版不建议把“自动识别敏感页面并阻止发送”作为硬需求。可靠的敏感信息识别很难，且如果识别依赖远程多模态模型，本身就已经泄露了截图。更现实的做法是前置授权、外部 API 二次确认、可见状态和快速停止。

### 模型分工

增加“视觉观察模型”和“reaction 模型”两个可选配置是合理的，而且比强制所有用户使用一个多模态模型更贴合本项目目标。

建议字段：

- `observation.visionModelRef?: ProviderModelRef`
  - 必须支持 `input` 包含 `image`。
  - 负责把截图转成结构化观察摘要。
  - 隐私敏感场景下更推荐本地模型。
- `observation.reactionModelRef?: ProviderModelRef`
  - 至少支持 `text`。
  - 负责根据观察摘要、当前 session 上下文、persona 和 reaction policy 生成候选反应。
  - 可以是更擅长对话风格的小模型或外部文本模型。

解析规则建议：

1. **两个都配置**：走 split pipeline。

   ```text
   screenshot -> visionModelRef -> observation summary -> reactionModelRef -> reaction gate
   ```

2. **只配置视觉模型**：如果该模型支持图片和文本输出，则同一个多模态模型完成截图理解和 reaction。第一版可以直接把它当作 single multimodal pipeline。
3. **只配置 reaction 模型**：
   - 如果它支持 `image`，同样可以作为单模型链路。
   - 如果它不支持 `image`，不能直接观察截图；需要回退到当前 session 多模态模型、默认 vision-capable fallback，或提示用户补充视觉模型。
4. **两个都没配置**：优先使用当前 session model；若当前 session model 不支持图片，再使用 Provider 默认模型或 fallback 中第一个支持 `image` 的模型；都不可用时提示“需要配置视觉模型”。

不建议第一版再加 `single` / `split` 模式开关。根据两个 model ref 是否存在、模型 capability 是否包含 `image` 自动推导即可，设置更少，也能避免用户理解额外模式。

这个拆分带来的收益：

- 可以用本地 vision 模型处理截图，把原图留在本机，再只把摘要交给外部或文本 reaction 模型。
- 可以把“看图能力”和“小猫说话风格”解耦，避免为了 reaction 风格被迫选择昂贵多模态模型。
- 可以更精确地做隐私门控：`localOnly` 开启时，vision 和 reaction 模型都必须本地；如果未开启 `localOnly` 且 reaction 模型是外部 API，它只能接收摘要，且需要单独确认摘要也可能包含敏感信息。

需要注意：视觉摘要本身可能包含 OCR 到的账号、文件名、聊天内容或网页内容，所以它不能被当作“已脱敏数据”。第一版应把视觉摘要也视为敏感内容，不写入日志，不进入 request snapshot；只有用户选择保存到会话时才落历史。

### 数据模型和落点

建议新增 capability：`observation`。

可能落点：

- `shared/types/observation.ts`
  - consent session、capture metadata、observation event、reaction policy 类型。
- `core/observation/`
  - `manager.ts`：授权状态、触发、截图生命周期、调用 chat/agent。
  - `types.ts`：core 内部接口。
  - `retention.ts`：临时文件清理策略。
- `electron/desktop-capture-service.ts`
  - Electron main 侧 `desktopCapturer` adapter。
- `electron/ipc/observation.ts`
  - 权限状态、开始/停止观察、一次性截图请求。
- `shared/constants.ts`
  - observation IPC channels。
- `shared/types/bridge.ts`
  - appBridge observation contract。
- `electron/preload.ts`、`src/bridge/app.ts`
  - bridge 暴露。
- `core/utils/data-paths.ts`
  - 如需持久/临时截图目录，统一放到数据根下，例如 `observations/` 或 `tmp/observations/`。
- `src/stores/observation.ts`
  - UI 状态、授权会话、最近 capture 状态。
- 设置页
  - 增加“主动观察”开关、默认关闭、权限说明、保存策略、频率限制。

设置建议新增到 `DesktopSettingsConfig`，但只保存默认策略：

- `observation.enabled`
- `observation.defaultIntervalMs`
- `observation.defaultDurationMs`
- `observation.defaultScope`
- `observation.visionModelRef?: ProviderModelRef`
- `observation.reactionModelRef?: ProviderModelRef`
- `observation.outputMode`: `ambient` / `chat` / `ask`
- `observation.retention`: `ephemeral` / `save_to_chat`
- `observation.allowRemoteProviders`
- `observation.localOnly`

运行中的观察会话不建议第一版落数据库，只保存在 runtime。事件类型里应保留 `targetSessionId`、`targetSessionKind`、`surface`、`captureId`、`visionSummary` 和 `reactionDecision` 等结构化字段，但默认不要把截图和视觉摘要落盘。真正需要审计时再增加 observation event 表或复用业务日志的结构化元数据。

### 与现有计划任务的关系

OpenOmniClaw 已经有 scheduled task executor。主动能力可以这样复用：

- `future_task` 继续负责普通“未来某时唤醒”。
- 主动观察会话不要复用用户可见的 `CronTask` 存储。
- `ScheduledTaskAgentExecutor` 的 synthetic message 注入模式值得沿用：观察 tick 也可以构造内部 user message，把截图作为 image context 附加进去。
- 如果未来把观察做成持久计划任务，必须要求用户在创建任务时确认截图会在未来自动发送给模型；如果没有有效授权，任务只能跳过并提示，而不是静默截图。

### Provider 能力判断

执行截图观察前必须检查目标模型链路：

- 视觉模型的 `ProviderModel.input` 是否包含 `image`。
- reaction 模型至少要能处理 `text`；如果它也包含 `image`，可以作为单模型链路使用。
- Provider 实现是否真的支持 image part，而不是只在模型 metadata 上标了 `image`。
- `visionModelRef` 和 `reactionModelRef` 是否仍然指向已启用 provider/model。删除 provider 或 model 时，需要像默认模型、标题模型一样清理引用或提示重新选择。
- 如果无法解析出支持图片的模型：
  - 降级为“无法观察屏幕，需要配置支持图片输入的视觉模型”。
  - 或允许用户从 fallback 中选择一个 vision-capable model。

不要仅按模型名称判断，要走现有 Provider capability。

本项目 PRD 明确偏向本地 7b - 20b 小模型，因此默认策略应偏本地：

- 如果视觉 Provider 是外部 API，或者无法可靠判断是否本地，启动观察会话时必须展示额外风险确认。
- 如果视觉模型本地、reaction 模型外部，仍要提醒“视觉摘要会发送给外部 API”，因为摘要可能包含 OCR 文本和页面内容。
- 如果 `localOnly` 开启，视觉模型和 reaction 模型都不能走外部 API；否则直接拒绝观察，并提示切换本地模型。

### 安全和隐私约束

这个功能的合格线应高于普通 read tool：

- 默认关闭。
- 每次观察会话必须有用户可理解的授权来源；观察会话期间的定时截图不再每次 ask-first。
- 常驻观察必须可见、可停止、有到期时间。
- 不在日志、IPC 日志、request snapshot 里记录截图内容、OCR 文本、窗口标题全文或敏感页面内容。
- 截图文件默认 ephemeral，完成请求后清理；需要持久化时必须用户主动选择。
- 不采集音频，不录屏，不做连续视频流。
- 不做鼠标键盘控制；如果未来做 computer use，必须作为独立高风险能力处理。
- 第一版不做复杂自动脱敏，不承诺能识别密码、支付、隐私窗口等敏感画面。
- 外部 API 风险必须前置说明：截图或截图摘要会发送给对应模型 Provider，可能受对方数据保留和训练策略影响。
- 提供 `localOnly` 模式，给隐私敏感用户一个简单、可理解的强约束。
- 在 macOS 上处理屏幕录制权限失败和重启提示。

推荐授权文案要点：

```text
主动视觉观察会按你设置的间隔截取屏幕图片，并发送给你配置的视觉模型；如果配置了单一多模态模型，它也会生成 reaction。
如果视觉模型或 reaction 模型来自外部 API，截图或截图摘要可能离开本机，可能包含聊天、网页、文件、账号、验证码或其他敏感信息。
OpenOmniClaw 默认不保存截图，不把截图写入日志；但外部 Provider 的数据处理规则由 Provider 决定。
请只在你理解并接受这些风险时开启。
```

这比每次 ask-first 更适合“主动能力”：风险在启动时讲清楚，运行时保持强可见状态和一键停止。

### 推荐阶段

1. **完整链路 + 立即触发**
   - 设置页新增主动视觉观察能力，默认关闭。
   - 模型配置里新增视觉观察模型和 reaction 模型两个可选选择器。
   - 当前会话可启动限时观察。
   - 支持按间隔截图和立即触发一次。
   - 只支持当前主屏或用户选择的单一来源。
   - 验证 provider image input、split pipeline、附件清理、权限错误、外部 API 风险确认。

2. **工具化**
   - 新增 `screen_observe` 内置工具。
   - 接入 ToolPolicy 和观察会话授权。
   - 支持 selected display/window。

3. **主动 reaction 产品化**
   - 猫窗口 ambient reaction。
   - 聊天内 reaction。
   - 观察运行态与目标 `chat` / `cat` session 的事件联动。
   - 观察摘要和用户可控审计。

## 结论

最适合 OpenOmniClaw 的路径是：

先不要做隐藏式后台智能体，也不要直接上连续录屏。主动能力应以“设置中默认关闭的能力 + 会话内限时观察”为产品边界；实现上先做完整链路，并用“立即触发一次”按钮验证，而不是做一个会被丢弃的一次性 MVP。

限时观察会话不建议复用用户可见的计划任务存储。可以复用现有 scheduled task 的 synthetic message 思路，但定时截图本身由 `ObservationManager` 管理 runtime timer，应用重启后默认停止观察。

限时观察会话也不建议新增 `observation` session kind。它应绑定到当前 `chat` 或 `cat` session；小猫弹窗只是 reaction surface，真正需要写入历史时再把消息落到目标 session，并用 metadata 标记来源。

模型上建议支持两个可选配置：视觉观察模型和 reaction 模型。只配一个多模态模型时走单模型链路；分别配置时，本地或多模态视觉模型先生成观察摘要，再交给 reaction 模型决定怎么说。

安全上不建议第一版做复杂自动脱敏。更可靠、成本更低的策略是：默认关闭、启动时明确告知、外部 API 二次确认、local-only 模式、截图不落日志、不默认持久化、运行时强可见和一键停止。

架构上参考 MaiBot 的“主动任务作为上下文进入 agent + timing gate 决定是否行动”，参考 AstrBot 的“cron synthetic event + send_message 工具 + 高敏感工具权限门控”。在 OpenOmniClaw 内则应复用现有 `AgentRunner`、`ToolPolicy`、`AttachmentService` 和 Provider image capability，并只借鉴 `CronManager` 的执行模式而不是直接复用它的任务存储。

## 参考

- MaiBot: `MaiBot/src/maisaka/runtime.py`
- MaiBot: `MaiBot/src/maisaka/reasoning_engine.py`
- MaiBot: `MaiBot/src/maisaka/builtin_tool/*`
- AstrBot: `AstrBot/astrbot/core/cron/manager.py`
- AstrBot: `AstrBot/astrbot/core/cron/events.py`
- AstrBot: `AstrBot/astrbot/core/tools/cron_tools.py`
- AstrBot: `AstrBot/astrbot/core/tools/message_tools.py`
- AstrBot: `AstrBot/astrbot/core/tools/computer_tools/cua.py`
- OpenOmniClaw: `shared/types/chat.ts`
- OpenOmniClaw: `shared/types/provider.ts`
- OpenOmniClaw: `electron/cat-window.ts`
- OpenOmniClaw: `docs/cat-panel-chat-design.md`
- Electron desktopCapturer: https://www.electronjs.org/docs/latest/api/desktop-capturer
- Electron systemPreferences: https://www.electronjs.org/docs/latest/api/system-preferences
