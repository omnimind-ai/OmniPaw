# Electron / IPC 规范

## 建议阅读顺序

按需展开：

1. renderer/main 通信：读 `安全边界`、`Bridge 与 IPC`
2. 新增 IPC：读 `IPC 变更 Playbook`
3. 新增跨进程事件：读 `事件`
4. 修改窗口行为：读 `窗口与外链`

---

## 安全边界

- MUST：保持 renderer 安全边界：`contextIsolation: true`、`nodeIntegration: false`。
- MUST：通过 preload 的 `contextBridge.exposeInMainWorld('openOmniClaw', bridge)` 暴露能力。
- MUST NOT：renderer 导入或使用 `electron`、`ipcRenderer`、`fs`、`path`、`better-sqlite3`、`@core/*`。
- MUST：敏感字段不能通过 renderer 可见对象回传；Provider API key 等秘密只能在 main/core 边界处理。

## Bridge 与 IPC

- MUST：IPC channel 名称集中放在 `shared/constants.ts`。
- MUST：跨进程 API 契约集中放在 `shared/types/bridge.ts` 和对应 `shared/types/*`。
- MUST：通用 IPC handler 按业务域放在 `electron/ipc/*.ts`，由 `electron/ipc/index.ts` 统一注册；`electron/main.ts` 只负责启动编排和调用注册入口。
- MUST：IPC handler 通过 `CoreRuntime` 依赖调用 core service/manager，不把业务规则写进 preload。
- MUST：新增通用 IPC 域时复用 `electron/ipc/common.ts` 的 `registerLoggedIpcHandler`，保持统一日志、耗时和失败记录。
- MUST：`electron/ipc/types.ts` 只放 IPC 注册依赖类型，不放业务类型、channel 常量或 handler 实现。
- MUST：与窗口状态强耦合的窗口专属 IPC 可以留在对应窗口模块，例如猫窗口 IPC 留在 `electron/cat-window.ts`。
- MUST：preload 只做参数兼容、错误解包、订阅/退订包装，不做业务持久化。
- MUST：settings 类错误保持结构化结果，preload 再转换为可抛出的 `SettingsOperationError`。
- MUST：fallback bridge 只用于 UI 空态和开发预览；保存、删除、刷新远程、测试 Provider 等持久化或外部副作用不能假成功。
- SHOULD：IPC handler 尽量薄，参数归一化后交给 core 服务。
- SHOULD：兼容旧调用签名的归一化逻辑集中在对应 `electron/ipc/<domain>.ts` 或 preload 的现有 normalize 函数附近。
- SHOULD：按 `IPC_CHANNELS` 的业务域拆分 IPC 文件，避免把无关 handler 混入同一个模块。
- MAY：为过渡期保留 legacy bridge 方法，但新增功能应优先走结构化 request。

## IPC 变更 Playbook

新增 IPC 方法时：

1. 在 `shared/constants.ts` 增加 channel。
2. 在 `shared/types/*` 定义 request/response 类型。
3. 在 `shared/types/bridge.ts` 增加 bridge 方法签名。
4. 在对应 `electron/ipc/<domain>.ts` 注册 handler 并调用 core；没有对应域时新增 domain 文件并接入 `electron/ipc/index.ts`。
5. 在 `electron/preload.ts` 暴露方法。
6. 在 `src/bridge/app.ts` 更新类型导出和 fallback 行为。
7. 更新 renderer 调用方。

约束：

- MUST：以上文件同步完成后才算新增 IPC 完整。
- MUST：renderer 调用方使用 `appBridge`，不绕过 preload。
- MUST：新增 handler 使用 `registerLoggedIpcHandler`，除非是明确不走 invoke 的事件订阅或窗口专属 IPC。
- MUST：新增 IPC 不把新的 core/service 单例挂到 `electron/main.ts`，依赖应通过 `CoreRuntime` 或对应窗口模块边界传入。

## 事件

- MUST：事件 channel 放在 `shared/constants.ts`。
- MUST：事件 payload 放在 `shared/types/*`。
- MUST：preload 中用统一 unsubscribe 包装。
- MUST：renderer 组件或 composable 卸载时取消订阅。
- SHOULD：跨窗口广播使用 `BrowserWindow.getAllWindows()`，并使用统一 IPC channel。
- SHOULD：耗时、可取消、流式任务传入 `webContents` 或 AbortSignal，避免全局单例事件混乱。

## 窗口与外链

- MUST：主动阻止新窗口在 WebContents 中打开。
- MUST：外链交给 `shell.openExternal`。
- SHOULD：保持 main 初始化顺序清晰：初始化 core、注册 IPC、创建窗口。
- SHOULD：保持 main/preload 输出 CJS 的构建配置不被无关改动影响。

## 常见落点

| 职责 | 路径 |
|------|------|
| IPC channel | `shared/constants.ts` |
| bridge 类型 | `shared/types/bridge.ts` |
| preload 暴露 | `electron/preload.ts` |
| IPC 总入口 | `electron/ipc/index.ts` |
| IPC 共享注册工具 | `electron/ipc/common.ts` |
| IPC 注册依赖类型 | `electron/ipc/types.ts` |
| IPC domain handler | `electron/ipc/<domain>.ts` |
| 窗口专属 IPC | 对应窗口模块，例如 `electron/cat-window.ts` |
| main 启动编排 | `electron/main.ts` |
| renderer bridge/fallback | `src/bridge/app.ts` |
| window 类型 | `src/types/window.d.ts` |

## 自检清单

- [ ] IPC 新能力完成 constants、shared types、domain handler、preload、renderer bridge 同步。
- [ ] 新增通用 handler 已接入 `electron/ipc/index.ts` 并使用统一注册包装。
- [ ] renderer 没有绕过 `appBridge`。
- [ ] 事件订阅有 unsubscribe。
- [ ] 敏感字段没有暴露给 renderer。
- [ ] main/preload 构建 alias 和输出格式未被无关修改。
