# Electron / IPC 约束

## 安全边界

- MUST：所有 renderer 保持 `contextIsolation: true` 和 `nodeIntegration: false`。
- MUST：renderer 只能通过 preload 暴露的 `omniPaw` bridge 使用主进程能力。
- MUST NOT：renderer 导入或使用 Electron、Node、数据库、文件系统、`@core/*` 或 `ipcRenderer`。
- MUST：秘密信息只能在 main/core 边界解析；不得通过 bridge 返回凭据、原始 Provider payload、附件正文或进程环境。

## 契约边界

- MUST：IPC channel 的唯一来源是 `shared/constants.ts`。
- MUST：完整 bridge 契约的唯一来源是 `shared/types/bridge.ts`；业务 payload 来自对应的 `shared/types/*`。
- MUST：preload、renderer 全局声明和 `appBridge` 直接依赖 `OmniPawBridge`，不得再定义第二套完整 bridge interface。
- MUST：新增或修改跨进程能力时，channel、shared payload、bridge、handler、preload、renderer 消费方和相关测试必须保持一致。
- SHOULD：新接口使用结构化 request/response；兼容签名只能保留在明确的边界适配层，不得扩散到业务实现。

## Main 与 IPC

- MUST：通用 IPC handler 按业务域归属 `electron/ipc/`，由统一入口注册；`electron/main.ts` 只承担应用启动和平台编排。
- MUST：handler 通过 `CoreRuntime` 或明确的平台 controller 调用能力，不得在 preload 中实现业务规则或持久化。
- MUST：通用 invoke handler 复用统一的注册、日志和错误边界；窗口专属 IPC 可以归属对应功能包。
- MUST：preload 只承担参数边界、错误解包和订阅封装，不持有业务状态。
- MUST：fallback bridge 只提供无副作用的降级体验；保存、删除、执行、刷新远端和其他副作用不得假成功。
- SHOULD：handler 保持薄边界，业务决策归属 core service/manager，平台行为归属 Electron controller/adapter。

## 事件与生命周期

- MUST：事件 channel 和 payload 由 `shared/` 定义。
- MUST：每个订阅 API 返回可重复安全调用的退订函数。
- MUST：renderer 在组件、composable 或窗口生命周期结束时取消订阅。
- MUST：流式、耗时或可取消任务通过平台无关的事件目标和取消契约与 core 交互，不得把 `WebContents` 注入 core。
- MUST：窗口销毁、应用退出和任务中止时停止向失效目标发送事件。

## 高风险能力

- MUST：Workspace IPC 仅暴露当前 session 的受管工作区能力；路径校验由 core 完成。
- MUST：Terminal process IPC 仅允许查询和终止已登记进程；renderer 不得通过 IPC 直接执行任意命令。
- MUST：进程输出必须受截断限制，进程环境和凭据不得进入 payload 或日志。
- MUST：设置和 Provider 操作保留结构化错误，renderer 不得依赖解析自由文本判断恢复策略。
- MUST：日志 IPC 只接收已规范化、脱敏的结构化字段，不记录 handler 入参和返回正文。

## 窗口与外链

- MUST：应用阻止未经处理的新 WebContents 窗口。
- MUST：外部链接交由系统浏览器，并在打开前执行协议和目标校验。
- MUST：窗口创建、恢复、关闭和退出语义由对应 Electron controller 统一拥有。
- MUST：桌宠窗口遵守 [desktop-pet.md](desktop-pet.md) 的透明、置顶、点击穿透和多窗口同步约束。
- SHOULD：main/preload 的输出格式和安全选项不得被无关 renderer 变更影响。

## 权威落点

| 职责 | 路径 |
|------|------|
| IPC channel | `shared/constants.ts` |
| bridge 契约 | `shared/types/bridge.ts` |
| preload | `electron/preload.ts` |
| IPC 总入口 | `electron/ipc/index.ts` |
| IPC domain | `electron/ipc/<domain>.ts` |
| main 编排 | `electron/main.ts` |
| core 装配 | `electron/core-runtime.ts` |
| renderer bridge | `src/bridge/app.ts` |
| 桌宠窗口 | `packages/desktop-pet/electron/controller.ts` |

## 自检约束

- [ ] 完整 bridge 契约没有重复定义。
- [ ] 所有跨层生产者和消费者使用同一 shared payload。
- [ ] renderer 没有绕过 preload/appBridge。
- [ ] 订阅、流式任务和窗口销毁路径有清理语义。
- [ ] 敏感信息、命令执行和文件访问边界没有扩大。
- [ ] main/preload/功能包变更通过架构边界验证和完整构建。
