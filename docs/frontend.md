# 前端规范

## 建议阅读顺序

按需展开：

1. 页面/路由：读 `Renderer 边界`、`路由`
2. 设置页/Provider 设置：读 `状态管理`、`设置页面`
3. Persona 或本地 Agent 设置：读 `Persona 设置页面`、`本地 Agent 设置`
4. 组件/样式：读 `shadcn-vue 与样式`
5. 错误提示/操作反馈：读 `错误与反馈`
6. 聊天 UI：读 `聊天页面`
7. 需要 main/core 能力：再读 [electron-ipc.md](electron-ipc.md)

---

## Renderer 边界

- MUST：把 renderer 视为 Electron renderer，不是纯 Web 后端客户端。
- MUST：所有主进程能力都通过 `src/bridge/app.ts` 的 `appBridge`。
- MUST NOT：在 renderer 中直接访问 Node API、Electron main API、数据库、文件系统或 `ipcRenderer`。
- MUST：复用 `@shared/types/*` 和 bridge 类型，不在组件里临时发明 IPC payload。
- MUST：对保存类操作考虑 fallback bridge；需要持久化的操作必须用 `ensureElectronBridge` 或等价边界阻止纯浏览器假保存。
- MUST：renderer 的诊断日志通过 `src/utils/logger.ts` 和 `appBridge.logging` 上报，不直接把 `console.*` 当成正式持久化日志通道。
- MUST：renderer 日志只保留结构化上下文，不回显 API key、附件正文、prompt、Provider 响应体或其他秘密字段。
- SHOULD：让 fallback runtime 只服务 UI 空态和开发预览，不把它当成真实持久化。

## 错误与反馈

- MUST：用户可见的错误弹窗和操作反馈使用现有 toast 封装，不新增浏览器 `alert`、自制浮层或新的通知库。
- MUST：组件和 composable 内使用 `src/utils/toast.ts` 暴露的 `useToast` / `errorToText` 等现有入口。
- MUST：全局未捕获错误继续由 `src/main.ts` 的 error handler 和 `unhandledrejection` 处理，不在页面里重复注册全局错误监听。
- SHOULD：异步加载、保存、删除、测试 Provider、刷新模型、发送消息等失败路径给出可读 toast。
- SHOULD：设置保存失败和 Provider 操作失败保留结构化错误供状态/UI 恢复使用，toast 只负责用户可见提示。

## 路由

- MUST：使用 Vue Router。
- MUST：路由集中在 `src/router/index.ts`，当前使用 `createWebHashHistory`。
- SHOULD：新增页面放在 `src/views/`，再在 router 中注册。
- SHOULD：需要导航入口时同步更新对应侧栏或页面入口。
- MAY：未完成页面继续使用 `RewritePlaceholderView.vue`，但新增真实功能时应替换为具体页面。

## 状态管理

- MUST：使用 Pinia setup store 管理跨页面状态。
- MUST：跨页面数据不要藏在页面局部 state 里。
- SHOULD：页面组件负责编排，composables 和 stores 承担可复用逻辑。
- SHOULD：聊天会话、消息流、附件处理分别放在 `useSessions`、`useMessages`、`useMediaHandling` 对应边界内。
- MAY：页面局部 UI 状态使用组件本地 `ref` / `computed`。

## 设置页面

设置页有两层配置状态：

- `config`：已持久化状态
- `draft`：编辑草稿

约束：

- MUST：保持设置页 `config`、`draft`、`saving`、`hasChanges`、autosave 队列关系稳定。
- MUST：保持 Provider 设置页自己的本地草稿/保存关系稳定，不把 Provider 表单状态混进全局设置页草稿模型。
- MUST：新增设置项时同步 core 配置 schema、shared type、bridge type、settings store 和具体表单。
- SHOULD：设置页 UI 的本地状态限制在控件展开、搜索、loading、dialog 等临时状态。
- SHOULD：对设置保存失败给出可读 toast，同时保留结构化错误供恢复 UI 使用。

### 普通 entry 类设置

当某个设置 tab 展示固定字段、开关、枚举、数值限制或少量静态分组时，使用普通 entry 类结构。典型场景包括常规设置、默认模型、本地 Agent 限制、主动视觉策略、Provider 详情表单等。

组件约定：

- MUST：每个逻辑分组使用 `src/components/settings/common/SettingsSection.vue`，不要在业务表单里直接拼 `CardHeader` 或新建单独的 form header。
- MUST：`SettingsSection` 传入 `title`、简短 `description` 和 lucide `icon`；图标以组件对象传入 `:icon="SomeIcon"`，不要用字符串 key。
- MUST：`SettingsSection` 的 header/content 两段由组件自身负责；普通表单不要直接使用 `SettingsPanelHeader`，除非是在构建满高 panel/list 容器。
- MUST：固定字段行使用 `SettingEntry`，放在 `FieldGroup class="gap-0"` 里；`SettingEntry` 左侧放字段标题、说明和 meta，右侧默认 slot 放控件。
- MUST：字段控件继续使用 shadcn-vue primitives，例如 `Switch`、`Select`、`Input`、`ToggleGroup`、`Checkbox`，不要用自定义 `div` 伪造控件。
- SHOULD：section 描述控制在一句短说明内，用来说明该分组的整体目的；字段级细节放在对应 `SettingEntry` 的 `description`，避免 header 和正文重复。
- SHOULD：有保存、刷新等分组级动作时使用 `SettingsSection` 的 `actions` slot；行级动作仍放在对应 `SettingEntry` 或字段控件附近。
- SHOULD：静态的 checkbox 集合、fallback 模型这类单一配置集合可以在 `SettingsSection` 内使用 `FieldSet` / `Field`，不需要升级为 `SettingsPanelItem`。

布局约定：

- MUST：普通滚动表单根节点使用 `flex flex-col gap-6` 这类自然文档流布局。
- MUST：普通表单继续由 `SettingsView.vue` 外层 `ScrollArea` 负责页面滚动，不在表单内部做满高 content 自滚动。
- SHOULD：`SettingsSection` 之间保持统一 `gap-*`，section 内列表边界交给 `SettingEntry` 的行分隔，不额外套卡片或嵌套 card。
- SHOULD：输入控件宽度使用稳定响应式约束，例如 `w-full md:w-48`、`w-full md:w-72`，避免长文案或模型名挤压布局。
- MUST NOT：为了强化标题层级新增 `SettingsFormHeader`、业务私有 header 或全局 CSS；普通 entry 类设置的标题层级统一由 `SettingsSection` 表达。

### 设置面板与条目列表

当某个设置 tab 需要展示一组可创建、搜索、编辑、删除、启用/停用的条目时，使用统一的 panel/list 结构。典型场景包括 Persona、Provider、工具配置、计划任务、MCP server、可复用 preset 或 registry 类设置。

组件约定：

- MUST：优先复用 `src/components/settings/common/SettingsPanelHeader.vue`、`SettingsSearchBar.vue`、`SettingsPanelItem.vue` 组合面板，不在业务表单里重新拼一套 header/search/item 样式。
- MUST：panel header 使用 `SettingsPanelHeader`，左侧放当前设置名称和描述，右侧通过 `icon` 或 `action` slot 放一个大图标或主要视觉动作。
- SHOULD：有搜索、过滤、统计、新建等能力时使用 `SettingsSearchBar`，搜索输入放左侧，统计 `Badge` 和新建按钮放 `summary` / `actions` slot。
- SHOULD：条目使用 `SettingsPanelItem`，左侧是头像/图标、名称、描述、badge/meta，右侧通过 `actions` slot 放启用、编辑、删除等按钮。
- MUST：多个条目各自作为独立 panel item 展示，列表容器使用 `flex flex-col gap-*`；不要用 `divide-y` 把条目连成一整块，除非该 tab 明确是表格/日志类密集数据。
- SHOULD：按钮内图标使用 `data-icon="inline-start"` 或 `data-icon`，按钮尺寸和 variant 优先沿用现有 shadcn-vue `Button` 变体。

布局约定：

- MUST：需要占满设置页剩余高度的 panel，根节点使用 `flex h-full min-h-0 flex-1 flex-col overflow-hidden` 这一类高度链路。
- MUST：满高 panel 的外层 `Card` 使用明确的三段布局：header、search/filter、content。推荐 `grid h-full min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)]`，content 行必须是 `minmax(0,1fr)`。
- MUST：content 区域使用内部滚动，而不是让整个设置页根节点滚动。推荐 `CardContent` 使用 `flex min-h-0 flex-1 flex-col overflow-y-auto p-0`，内部再放 `flex min-h-full flex-1 flex-col`。
- SHOULD：空状态和搜索空状态放在 content 的自然剩余空间中心，使用 `flex flex-1 flex-col items-center justify-center`，不要只靠固定 `py-*` 伪造居中。
- SHOULD：有条目时，列表容器也保留 `flex-1`，例如 `flex flex-1 flex-col gap-3 px-4 py-4`，让内容区域视觉上自然填满 panel。
- SHOULD：panel 外层边界放在 `Card` 上，例如 `border border-border` 或现有 Card 默认边界；内部只在必要分区使用分隔线。search/filter 与 content 之间通常不需要额外 border。

滚动边界注意：

- MUST：如果某个 tab 的 panel 需要内部 content 滚动并占满页面，`SettingsView.vue` 中该 tab 不应再包在外层 `ScrollArea` 里。Reka/shadcn-vue `ScrollArea` 的 viewport 内部会生成额外内容节点，容易打断 `h-full` / `flex-1` 的高度继承，让子 Card 退回内容高度。
- SHOULD：普通表单、长配置表单可以继续使用 `SettingsView.vue` 的外层 `ScrollArea`；只有需要“header/search 固定，content 自滚动”的 panel tab 才单独走满高 flex 容器。
- MUST：满高链路要从 `SidebarInset` / `main` / tab content wrapper / 表单根节点 / `Card` / `CardContent` 一路保持 `h-full`、`min-h-0`、`flex-1` 中的必要组合。缺少任一层都可能导致面板不能自然填满下方区域。
- SHOULD：遇到“看起来缺一截”时，先检查是否被外层 `ScrollArea` 或自然高度 wrapper 截断，再检查 Card 本身；shadcn-vue `Card` 可以满高，关键是父级必须提供可继承高度。

新增普通设置字段 Playbook：

1. 更新 `shared/types/settings.ts`。
2. 更新 `core/config/schema.ts` 默认值、normalize、validate。
3. 更新 `src/bridge/app.ts` 的 bridge 类型。
4. 更新 `src/stores/settings.ts` 的读写方法。
5. 更新具体设置表单。
6. 核对 autosave 与 fallback bridge 行为。

## Provider 设置页面

- MUST：Provider 表单状态使用本地 provider draft，不直接编辑 settings store 的持久化对象。
- MUST：保存 Provider 时通过 `useProviderStore` 和 bridge，不绕过 main/core。
- MUST：不在 renderer 回显 API key 等秘密字段。
- SHOULD：空 Provider  registry 展示空态，不自动创建占位 Provider。
- SHOULD：从预设添加 Provider 时先落成本地 draft，再由显式保存写入 registry。
- SHOULD：删除 Provider 使用抽出的 `ProviderDeleteModal.vue`，删除后采用核心返回或 store 返回的 next selection。
- SHOULD：默认模型、备用模型、流式开关走 Provider store 的显式更新方法，不再通过 settings draft 间接保存。
- SHOULD：Provider 模型、能力、compat 字段保持 config、shared type、UI 三侧命名一致。
- SHOULD：测试 Provider、刷新模型、保存、删除路径提供 loading/disabled/error 状态。

## Persona 设置页面

- MUST：Persona 列表、创建、编辑、删除和默认选择通过 `usePersonaStore` 和 bridge，不混入 settings draft。
- MUST：Persona prompt 视为系统上下文敏感内容，不进入 renderer 日志、toast 详情、调试上下文或聊天消息正文。
- MUST：默认 Persona 只影响新建会话；已创建会话的 `systemContext` 不随设置页修改隐式变化。
- MUST：fallback bridge 下禁用 Persona 保存类操作，不假成功。
- SHOULD：加载、保存、删除、启用和停用路径提供 loading/disabled/error 状态。

## 本地 Agent 设置

- MUST：workspace/terminal 开关和限制走 settings draft/autosave，不绕过 settings store。
- MUST：UI 文案区分 assistant ask-first 与 power full local access；power 不伪装成普通开关或低风险模式。
- MUST：Workspace 文件状态和 terminal process 操作通过 bridge，不在 renderer 直接访问 Node、文件系统或 shell。
- MUST：不要在 UI 日志或 toast 详情里回显完整 env、未截断 stdout/stderr、敏感路径或凭据。
- SHOULD：删除、导出、终止进程等操作使用明确用户动作和可恢复反馈。

## shadcn-vue 与样式

- MUST：优先复用 `src/components/ui/` 已落地的 shadcn-vue/Reka UI 组件，如有必要可参考 shadcn vue相关skill中的约束添加ui。
- MUST：遵守 `components.json`：Tailwind v4 CSS 文件是 `src/styles/main.css`，图标库是 `lucide`，UI alias 是 `@/components/ui`，utils alias 是 `@/lib/utils`。
- MUST：使用 `lucide-vue-next` 图标；按钮内图标遵守现有 shadcn-vue 组件约定。
- MUST：设置表单使用 `FieldGroup`、`Field`、`FieldLabel`、`FieldDescription`、`FieldContent` 等现有 primitives。
- MUST：通过语义 token 和 shadcn-vue 变量表达颜色，不在组件里硬编码临时色板。
- MUST：用 `cn()` 组合条件 class。
- MUST：弹窗类 UI（`Dialog`、`AlertDialog`、`Sheet`、`Drawer` 等）必须单独抽成 `*Modal.vue` 组件，页面/表单父组件只负责 open 状态、业务数据和事件编排。
- MUST NOT：为局部组件在 `src/styles/main.css` 添加大段私有样式；该文件只承载全局样式、Tailwind v4 token 和确实全局的规则。
- SHOULD：使用 `Badge`、`Skeleton`、`Separator`、`Dialog`、`Sheet`、`Tabs`、`Select` 等现有组件，不用自定义 `div` 伪造基础控件。
- SHOULD：新增可复用基础 UI 时先检查 shadcn-vue registry 和 `src/components/ui/`。

新增 shadcn-vue 组件 Playbook：

1. 先检查 `src/components/ui/` 是否已存在。
2. 不存在时使用项目包管理器运行 shadcn-vue CLI 添加。（参考 Shadcn Vue skill）
3. 添加后阅读落地文件，修正 alias、图标库和组合结构。
4. 不直接覆盖已有本地修改。

## 聊天页面

- SHOULD：`ChatHomeView.vue` 负责页面编排。
- SHOULD：`ChatSidebar.vue` 负责会话侧栏。
- SHOULD：`ChatComposer.vue` 负责输入、附件、模型选择和发送。
- SHOULD：流式展示基于 `onStreamEvent`，legacy token/done 订阅只作为过渡。
- SHOULD：在组件卸载时清理事件订阅、object URL、媒体缓存、计时器和未完成的 UI 资源。

## 常见落点

| 职责 | 路径 |
|------|------|
| 路由 | `src/router/index.ts` |
| 聊天页 | `src/views/ChatHomeView.vue` |
| 设置页 | `src/views/SettingsView.vue` |
| 设置表单 | `src/components/settings/` |
| 设置通用组件 | `src/components/settings/common/` |
| Provider 设置子组件 | `src/components/settings/provider-settings/` |
| Provider 设置弹窗 | `src/components/settings/provider-settings/ProviderDeleteModal.vue` |
| Persona 设置 | `src/components/settings/PersonaSettingsForm.vue` |
| 本地 Agent 设置 | `src/components/settings/LocalAgentSettingsForm.vue` |
| 基础 UI | `src/components/ui/` |
| 聊天状态 | `src/stores/chat.ts` |
| 设置状态 | `src/stores/settings.ts` |
| Provider 状态 | `src/stores/provider.ts` |
| Persona 状态 | `src/stores/persona.ts` |
| bridge | `src/bridge/app.ts` |

## 自检清单

- [ ] renderer 没有直接访问 Node、Electron main、数据库或文件系统。
- [ ] 新增 UI 复用了现有 shadcn-vue 组件和语义 token。
- [ ] 列表型设置页复用了 `SettingsPanelHeader`、`SettingsSearchBar`、`SettingsPanelItem`，满高 panel 的滚动边界正确。
- [ ] 设置和 Provider 表单没有破坏 draft/autosave。
- [ ] Persona 与本地 Agent 设置没有绕过对应 store/bridge 边界。
- [ ] 用户可见错误和操作反馈使用现有 toast 封装。
- [ ] 所有 bridge payload 使用 shared 类型。
- [ ] 事件订阅、计时器、媒体 URL 已清理。
- [ ] `pnpm typecheck` 可通过或已说明未运行原因。
