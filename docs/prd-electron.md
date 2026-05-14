# OmniClaw Electron 重写 PRD

## 一、可行性评估

### 总体结论：可行，风险可控

经过对 OpenOmniClaw（TypeScript/Node.js 网关架构）和 AstrBot（Python 多平台助手）的深度分析，Electron 重写方案是可行的，两个项目都提供了大量可直接借鉴的成熟设计。

### 核心可行性依据

| 目标功能 | 评估 | 现有参考 |
|---------|------|---------|
| OpenAI 兼容 LLM 对话 | ✅ 高可行 | OpenOmniClaw `src/agents/` 已实现 15+ Provider 抽象，可直接借鉴 |
| 多 Provider 接口 | ✅ 高可行 | `model-catalog.ts`、`model-fallback.ts`、`model-auth.ts` 架构清晰 |
| 上下文管理 | ✅ 高可行 | `chat-replay.ts` + `conversation_mgr.py`，两者各有侧重，可取长补短 |
| Skill 能力 | ✅ 高可行 | OpenOmniClaw Plugin SDK 设计规范，AstrBot 提供 1000+ 社区插件实践经验 |
| 定时任务 | ✅ 高可行 | OpenOmniClaw `src/cron/` 使用 `croner`，可直接移植 |
| Electron 悬浮窗 | ✅ 高可行 | 相比 Tauri 的不成熟方案，Electron 的 BrowserWindow 对悬浮窗支持更稳定 |

### 主要风险与应对

| 风险 | 等级 | 应对策略 |
|------|------|---------|
| Electron 体积 | 中 | 合理拆分功能模块，避免引入重型依赖；Electron 基础约 100MB，可接受 |
| 小模型效果 | 中 | 针对 7b-20b 做专项 Prompt 工程 + 上下文压缩策略，这是核心差异化 |
| 开发周期 | 低 | 两个参考项目覆盖了所有核心功能，架构路径已验证，不需要从零设计 |
| 跨平台兼容 | 低 | Electron 在 macOS/Windows/Linux 生态成熟，无 Tauri 的 WebView 兼容问题 |

---

## 二、产品目标

OmniClaw Electron 版的产品定位：

1. **桌面端 AI 助手**：作为日常可用的本地 AI 伴侣，而非开发者工具
2. **OmniInfer 生态入口**：开源宣传载体，帮助用户体验本地部署 7b-20b 模型的能力
3. **开箱即用**：零配置或极简配置可上手，降低用户门槛
4. **小模型友好**：对 7b-20b 规模模型做专项优化，补偿其上下文窗口小、指令遵从弱的问题
5. **足够日常使用**：聚焦核心场景，不追求功能大而全

---

## 三、重写背景与动机

### 旧版问题（OpenClaw + Tauri 方案）

1. **维护困难**：OpenClaw 仓库体积大、耦合度高，二次开发成本高
2. **体积失控**：依赖链臃肿，打包体积逼近 500MB，不符合桌面应用预期
3. **悬浮窗不稳定**：Tauri 的多窗口/悬浮窗能力不成熟，用户体验差
4. **学习门槛高**：OpenClaw 高级功能复杂，配置项过多，普通用户难以上手
5. **模型部署耦合**：通过 Tauri sidecar 管理本地模型，架构过重，灵活性差

### 新方向

- 脱离 gateway sidecar 模式，让 OmniClaw 直接成为桌面应用
- 借鉴 AstrBot 的模块化设计，代码可维护性优先
- 借鉴 OpenOmniClaw 成熟的 Provider 抽象和 Plugin SDK 设计

---

## 四、功能规划

### MVP 阶段（P0 核心功能）

#### 4.1 LLM 对话

**基础对话**
- 支持流式输出（SSE/WebSocket streaming）
- 支持 Markdown 渲染（含代码高亮）
- 支持多轮对话历史展示
- 支持停止生成

**小模型优化**
- 自动上下文窗口管理：超出 token 限制时智能截断或压缩历史（参考 AstrBot `conversation_mgr.py`）
- Prompt 模板优化：针对小模型的 system prompt 精简设计，减少指令遵从负担
- 流式容错：小模型 JSON 输出不稳定时的解析容错

#### 4.2 多 Provider 支持

**第一阶段支持**
- OmniInfer 本地部署（核心，OpenAI 兼容接口）
- OpenAI / OpenAI 兼容接口（通用）
- DeepSeek、Qwen 等主流国内 API

**Provider 管理**
- UI 可视化配置 Provider（baseURL、API Key、模型列表）
- 多 Provider 切换

参考：OpenOmniClaw `src/agents/model-catalog.ts`、`model-auth.ts` 的 profile 体系和 Astrbot 的provider体系

#### 4.3 上下文管理

- 会话（Session）管理：新建、切换、删除、重命名会话
- 会话持久化：本地 SQLite 存储所有历史消息
- 上下文窗口策略：
  - 保留最近 N 轮（可配置）
  - 超长对话自动摘要压缩（调用 LLM 自摘要）
- 全局搜索：跨会话消息关键词搜索

#### 4.4 Skill 能力

**Skill 体系设计**（参考 OpenOmniClaw Plugin SDK）

Skill 是可调用的工具函数（Tool Use / Function Calling），供 LLM 在对话中按需调用。

**内置 Skill**
- 网络搜索（Brave Search / Bing）
- 剪贴板读写
- 文件读取（用户明确授权）
- 系统时间 / 日历查询

**Skill 扩展机制**
- Skill 以 npm 包形式分发，或本地目录加载
- 标准接口：`{ name, description, parameters: JSONSchema, execute: Function }`
- UI 中可查看、启用/禁用、配置 Skill

**小模型适配**
- Skill 描述精简化（description 控制在 50 字以内，避免大 schema）
- 支持关闭 Skill（纯对话模式），避免小模型 function calling 失控

#### 4.5 定时任务

参考 OpenOmniClaw `src/cron/` 的 croner 实现：

- 基于 Cron 表达式创建定时任务
- 任务内容：向指定会话发送预设 Prompt，获取 LLM 响应
- 任务执行日志查看
- UI 管理界面（创建、编辑、启用/禁用、删除、手动触发）
- 系统通知推送执行结果

---

### 增强阶段（P1 功能）

#### 4.6 知识库 / RAG（轻量版）

- 支持导入本地文档（TXT、Markdown、PDF）
- 基于 SQLite-vec 的本地向量检索（参考 OpenOmniClaw `extensions/memory-lancedb`）
- 使用本地 Embedding 模型（避免依赖外部 API）
- 检索结果注入对话上下文

#### 4.7 悬浮窗模式

- 系统托盘常驻
- 可唤起小悬浮窗（不遮挡工作区）进行快速问答
- 全局热键唤起
- 悬浮窗自动关闭/收起

#### 4.8 个人设定 / 角色扮演

- 可配置 AI 人设（name、avatar、system prompt）
- 预设人设模板

---

### 未来方向（P2）

- MCP（Model Context Protocol）支持
- 语音输入输出（STT/TTS）
- 图像理解（视觉模型支持）
- 多窗口对话
- 插件市场

---

## 五、技术架构

### 整体设计原则

- **UI 层 + Core 层分离**：UI 只负责展示和交互，业务逻辑全在 Core 层
- **Electron IPC 桥接**：Main Process 运行 Core，Renderer Process 运行 Vue UI，通过 `ipcMain/ipcRenderer` 通信
- **TypeScript 全栈**：共享类型定义，减少前后端类型对齐成本
- **本地优先**：所有数据存本地（SQLite），无强制云依赖

### 技术栈

| 层次 | 技术选型 | 说明 |
|------|---------|------|
| 桌面框架 | Electron 36+ | 成熟的跨平台方案，多窗口能力强 |
| 前端框架 | Vue 3 + TypeScript | Composition API，与 AstrBot dashboard 同栈 |
| UI 组件库 | shadcn-vue / Naive UI | 轻量，易于定制 |
| 状态管理 | Pinia | Vue 官方推荐，参考 AstrBot dashboard 实践 |
| 路由 | Vue Router 4 | - |
| 样式 | UnoCSS / Tailwind | 原子化 CSS，体积可控 |
| 构建工具 | Vite + electron-vite | 开发体验好，HMR 支持 |
| 本地数据库 | better-sqlite3 | 同步 SQLite，性能好 |
| 向量存储 | sqlite-vec | OpenOmniClaw 已验证，轻量无额外依赖 |
| 定时任务 | croner | 参考 OpenOmniClaw 实现，轻量 |
| 打包 | electron-builder | 生成 .dmg / .exe / .AppImage |

### 目录结构

```
OpenOmniClaw/
├── electron/                  # Electron 主进程 (Main Process)
│   ├── main.ts                # 入口，窗口管理，应用生命周期
│   ├── ipc/                   # IPC handler 注册
│   │   ├── chat.ts            # 对话相关 IPC
│   │   ├── provider.ts        # Provider 配置 IPC
│   │   ├── skill.ts           # Skill 调用 IPC
│   │   └── cron.ts            # 定时任务 IPC
│   └── preload.ts             # 预加载脚本，暴露安全 API
│
├── core/                      # 业务核心层 (运行在 Main Process)
│   ├── provider/              # LLM Provider 抽象
│   │   ├── manager.ts         # Provider 注册与切换
│   │   ├── base-provider.ts   # 基础接口定义
│   │   └── providers/         # 各 Provider 实现
│   │       ├── openai.ts
│   │       ├── ollama.ts
│   │       └── omniinfer.ts
│   ├── chat/                  # 对话逻辑
│   │   ├── session-manager.ts # 会话增删改查
│   │   ├── context-manager.ts # 上下文窗口管理
│   │   └── stream-handler.ts  # 流式输出处理
│   ├── skill/                 # Skill 系统
│   │   ├── skill-manager.ts   # Skill 注册与执行
│   │   ├── built-in/          # 内置 Skill
│   │   └── loader.ts          # 外部 Skill 加载
│   ├── cron/                  # 定时任务
│   │   ├── cron-manager.ts
│   │   └── isolated-runner.ts
│   ├── db/                    # 数据库层
│   │   ├── client.ts          # SQLite 连接
│   │   ├── migrations/        # 数据库迁移
│   │   └── repos/             # 各实体 Repository
│   └── config/                # 配置管理
│       ├── config-manager.ts
│       └── schema.ts          # 配置 JSON Schema
│
├── src/                       # Vue 前端 (Renderer Process)
│   ├── main.ts
│   ├── App.vue
│   ├── router/
│   ├── stores/                # Pinia stores
│   │   ├── chat.ts
│   │   ├── provider.ts
│   │   └── settings.ts
│   ├── views/
│   │   ├── ChatView.vue       # 主对话界面
│   │   ├── SettingsView.vue   # 设置页
│   │   ├── SkillsView.vue     # Skill 管理
│   │   └── CronView.vue       # 定时任务管理
│   ├── components/
│   │   ├── chat/              # 对话组件
│   │   ├── message/           # 消息气泡、Markdown 渲染
│   │   └── common/            # 通用组件
│   └── bridge/                # IPC 调用封装（renderer 侧）
│
├── shared/                    # Main/Renderer 共享类型
│   ├── types/
│   │   ├── chat.ts
│   │   ├── provider.ts
│   │   └── skill.ts
│   └── constants.ts
│
├── resources/                 # 静态资源（图标、托盘图标等）
│
├── electron.vite.config.ts
├── package.json
└── tsconfig.json
```

### IPC 通信模式

采用请求-响应 + 事件推送双模式：

```typescript
// Renderer → Main: 请求
window.bridge.chat.sendMessage({ sessionId, content })
  .then(response => /* 首次响应 */)

// Main → Renderer: 流式推送
window.bridge.chat.onToken((token: string) => /* 追加到 UI */)
window.bridge.chat.onDone(() => /* 完成 */)
```

---

## 六、数据模型

### 核心数据结构

```typescript
// 会话
interface Session {
  id: string
  title: string
  providerId: string
  modelId: string
  systemPrompt?: string
  createdAt: number
  updatedAt: number
}

// 消息
interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  tokenCount?: number
  createdAt: number
}

// Provider 配置
interface ProviderConfig {
  id: string
  name: string
  type: 'openai-compatible' | 'ollama' | 'omniinfer'
  baseUrl: string
  apiKey?: string
  models: ModelConfig[]
  enabled: boolean
}

// Skill
interface SkillDefinition {
  name: string
  description: string
  parameters: JSONSchema
  execute: (params: unknown) => Promise<unknown>
}

// 定时任务
interface CronTask {
  id: string
  name: string
  cron: string
  sessionId: string
  prompt: string
  enabled: boolean
  lastRunAt?: number
  lastResult?: string
}
```

---

## 七、用户体验设计原则

1. **首次启动 30 秒上手**：引导流程不超过 3 步（选 Provider → 填 API Key → 开始对话）
2. **配置最小化**：默认值合理，不强迫用户了解所有选项
3. **错误友好**：连接失败、模型不支持等场景给出具体可操作提示，而非技术错误信息
4. **响应感知**：流式输出 + 打字光标，让等待不焦虑
5. **本地优先感**：设置页明确告知数据存储位置，强调隐私安全

---

## 八、里程碑计划

| 阶段 | 目标 | 关键交付 |
|------|------|---------|
| M1 | 骨架搭建 | Electron + Vue 工程初始化，IPC 通信验证，SQLite 接入 |
| M2 | 核心对话 | OpenAI 兼容 Provider 接入，流式对话可用，会话持久化 |
| M3 | 多 Provider | OmniInfer、Ollama 接入，Provider 管理 UI |
| M4 | Skill + Cron | 内置 Skill 3-5 个，定时任务可用 |
| M5 | 体验打磨 | 悬浮窗、系统托盘、全局热键，打包发布 |
| M6 | 开源发布 | 文档完善、README、CI/CD 自动构建 |

---

## 九、与现有项目的关系

| 项目 | 关系 | 借鉴内容 |
|------|------|---------|
| OpenOmniClaw | 前身，参考架构 | Provider 抽象、Plugin SDK 设计、Cron 实现、Memory 方案 |
| AstrBot | 参考实现 | Vue 3 + Pinia dashboard 结构、多 Provider 管理模式、Skill 沙箱思路 |
