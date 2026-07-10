# 前端约束

## Renderer 边界

- MUST：renderer 只通过 `src/bridge/app.ts` 的 `appBridge` 使用主进程能力。
- MUST NOT：renderer 直接访问 Electron、Node、数据库、文件系统、`ipcRenderer` 或 `@core/*`。
- MUST：bridge payload 使用 `shared/types/*`，不得在组件中复制跨进程契约。
- MUST：具有持久化或外部副作用的操作在非 Electron fallback 环境中明确失败或不可用，不得假成功。
- MUST：renderer 日志通过现有 logger/bridge 边界上报，并遵守脱敏约束。

## Vue 与组件边界

- MUST：新增或修改的 Vue 组件使用 Vue 3 Composition API、`<script setup>` 和 TypeScript，除非现有兼容边界明确要求其他形式。
- MUST：props 只读；跨组件状态变化通过 typed emits、`v-model`、Pinia 或受控 provide/inject 边界表达。
- MUST：computed 保持无副作用；异步请求、持久化和外部资源管理归属 action、composable 或生命周期边界。
- MUST：事件订阅、watcher 外部资源、计时器、媒体流、object URL 和 DOM listener 在组件卸载时清理。
- MUST：不可信 HTML 在渲染前经过现有清洗边界，不直接使用未清洗的 `v-html`。
- SHOULD：页面负责路由级编排，业务状态归属 store，可复用交互归属 composable，纯展示归属组件。

## 路由与页面

- MUST：路由集中在 `src/router/index.ts`，并保持 Electron 兼容的 hash history 语义。
- MUST：新增或删除页面时同步路由、导航入口、空态和深链行为。
- MUST：聊天路由保持 `ChatWorkspace` 壳层与首页/会话内容子路由的责任分离。
- SHOULD：路由组件不直接承担可复用业务状态或跨页面缓存。

## 状态管理

- MUST：跨页面、跨路由或跨窗口事件驱动的 renderer 状态由 Pinia setup store 或明确的共享上下文管理。
- MUST：持久化对象、编辑草稿、保存状态和错误状态不得混为同一可变引用。
- MUST：store action 通过 `appBridge` 调用主进程，不绕过 bridge 边界。
- SHOULD：页面局部展示状态留在组件内；派生状态优先使用 computed。

## 设置页面

- MUST：桌面设置保持已持久化 `config` 与可编辑 `draft` 分离，并保持 `saving`、`hasChanges` 和 autosave 队列一致。
- MUST：Provider registry 使用独立的 provider draft/store，不并入桌面 settings draft。
- MUST：设置字段变更同步 shared 契约、core schema、bridge 消费方、store、表单和验证。
- MUST：保存失败保留结构化错误和未保存草稿，不得把失败状态伪装为已持久化。
- MUST：固定字段设置复用现有 section/entry 组件；可搜索、增删、启停的集合复用现有 panel/list 组件族。
- MUST：滚动责任只能由一个明确容器拥有；满高面板和普通文档流表单不得叠加冲突的滚动边界。
- SHOULD：设置页公共视觉层级、空态、loading、disabled 和错误状态保持跨 tab 一致。

## Provider 与本地 Agent UI

- MUST：Provider 表单不直接编辑持久化 registry 对象，凭据不得回显到 renderer 状态、日志或 toast。
- MUST：Provider 保存、测试、刷新、删除、默认模型和 fallback 更新通过 Provider store/bridge 的显式操作完成。
- MUST：workspace、terminal 和进程操作通过受限 bridge；UI 不得提供绕过 Agent policy 的任意命令入口。
- MUST：assistant 与 full local access 的权限含义在 UI 中明确区分，不得用低风险文案掩盖高权限能力。
- SHOULD：异步副作用提供一致的 pending、disabled、success 和 recoverable error 状态。

## UI 系统与样式

- MUST：基础交互复用 `src/components/ui/` 中的 shadcn-vue/Reka 组件和项目语义 tokens。
- MUST：图标使用项目既有 lucide 边界，条件 class 使用现有 class 合并工具。
- MUST：颜色、边框、阴影和状态反馈使用语义变量，不在业务组件中建立私有临时色板。
- MUST：全局样式文件只承载 tokens、reset 和真正跨页面规则；局部样式与组件共置。
- MUST：弹窗类交互保持独立组件边界，父级只负责业务数据、打开状态和事件编排。
- MUST：新增基础 UI 不得覆盖 registry 生成组件上的已有本地修改。
- SHOULD：可访问名称、键盘操作、焦点恢复和禁用状态沿用基础组件语义。

## 国际化与反馈

- MUST：用户可见静态文案使用 `vue-i18n`，所有受支持语言同步新增 key。
- MUST：语言来源与桌面设置保持一致，组件不得自行建立第二套 locale 来源。
- MUST：用户可见错误和操作反馈使用现有 toast 边界，不新增浏览器 `alert` 或另一套通知系统。
- MUST：全局未捕获错误只由应用入口统一处理，页面不得重复注册全局错误监听。
- SHOULD：用户内容、Provider 内容、模型消息和日志原文不做界面翻译。

## 聊天 UI

- MUST：聊天壳层、首页、内容页、消息列表和输入区保持独立责任。
- MUST：流式 UI 以结构化 stream event 为权威，兼容订阅不得成为新功能依赖。
- MUST：会话切换、流结束、中止和路由卸载时释放订阅及临时媒体资源。
- MUST：消息片段展示与 `shared/types/chat.ts` 保持穷尽兼容；未知或不可展示片段提供安全降级。

## 权威落点

| 职责 | 路径 |
|------|------|
| 路由 | `src/router/index.ts` |
| 聊天壳层 | `src/components/chat/ChatWorkspace.vue` |
| 聊天页面 | `src/views/ChatHomeView.vue`、`src/views/ChatContentView.vue` |
| 聊天组件 | `src/components/chat/` |
| 聊天 composables | `src/composables/chat/` |
| 设置页 | `src/views/SettingsView.vue` |
| 设置组件 | `src/components/settings/` |
| stores | `src/stores/` |
| bridge | `src/bridge/app.ts` |
| 基础 UI | `src/components/ui/` |
| 国际化 | `src/i18n/` |
| 全局 tokens | `src/styles/main.css` |

## 自检约束

- [ ] renderer 没有越过 appBridge 和 shared 契约边界。
- [ ] Vue 组件符合 Composition API、typed props/emits 和资源清理约束。
- [ ] 设置与 Provider 的持久化对象、草稿和保存状态未混合。
- [ ] UI 复用了现有基础组件、语义 tokens 和反馈系统。
- [ ] 聊天事件、路由切换和媒体资源生命周期完整。
- [ ] 类型检查通过。
