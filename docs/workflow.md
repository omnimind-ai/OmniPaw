# 变更流程与自检

## 推荐顺序

1. 定位任务域，先读 `AGENTS.md` 和对应专题文档。
2. 用 `rg` 搜现有实现和调用点。
3. 复用已有边界和同目录写法。
4. 做最小改动。
5. 运行与风险匹配的验证命令。
6. 交付时说明改了什么、验证了什么、未验证什么。

## MUST

- MUST 不修改无关文件，不格式化无关代码。
- MUST 不还原用户已有改动。
- MUST 新增跨层能力时同步所有契约文件。
- MUST 对数据库、配置、IPC、Provider、Agent 工具等高风险变更运行对应验证，无法运行时说明原因。
- MUST 在最终说明中报告未运行的关键验证。

## SHOULD

- SHOULD 常规 TS/Vue 改动运行 `pnpm typecheck`。
- SHOULD main/preload/build 配置改动运行 `pnpm build`。
- SHOULD 配置改动运行 `node scripts/run-electron-node.mjs tests/smoke/settings-config-smoke.ts`。
- SHOULD Provider registry 改动运行 `node scripts/run-electron-node.mjs tests/smoke/provider-registry-smoke.ts`。
- SHOULD 数据库改动运行 `node scripts/run-electron-node.mjs tests/smoke/db-smoke.ts`。
- SHOULD 聊天 core 改动运行 `node scripts/run-electron-node.mjs tests/smoke/chat-core-smoke.ts`。
- SHOULD Agent/tool 改动运行 `node scripts/run-electron-node.mjs tests/smoke/chat-core-smoke.ts`、`node scripts/run-electron-node.mjs tests/smoke/tool-management-smoke.ts` 或相关 agent smoke。
- SHOULD 本地 workspace/terminal 改动运行 `node scripts/run-electron-node.mjs tests/smoke/local-agent-smoke.ts`。
- SHOULD logger / 日志系统改动运行 `node scripts/run-electron-node.mjs tests/smoke/logging-smoke.ts`；如果同时影响 main、preload 或打包链路，再补 `pnpm build`。
- SHOULD UI 行为改动在需要时运行 Playwright；运行前先核对现有测试是否与当前 UI 同步。

## MAY

- MAY 对纯文档改动只做格式和链接检查。
- MAY 对局部低风险改动只运行 typecheck，但需判断风险范围。

## 验证命令索引

| 场景 | 命令 |
|------|------|
| 全部 smoke | `pnpm test` |
| TypeScript / Vue 类型 | `pnpm typecheck` |
| 完整构建 | `pnpm build` |
| 配置 | `node scripts/run-electron-node.mjs tests/smoke/settings-config-smoke.ts` |
| Provider registry | `node scripts/run-electron-node.mjs tests/smoke/provider-registry-smoke.ts` |
| 数据库 | `node scripts/run-electron-node.mjs tests/smoke/db-smoke.ts` |
| 聊天 core | `node scripts/run-electron-node.mjs tests/smoke/chat-core-smoke.ts` |
| Agent runtime | `node scripts/run-electron-node.mjs tests/smoke/agent-runtime-smoke.ts` |
| Tool management | `node scripts/run-electron-node.mjs tests/smoke/tool-management-smoke.ts` |
| 本地 workspace/terminal | `node scripts/run-electron-node.mjs tests/smoke/local-agent-smoke.ts` |
| 日志系统 | `node scripts/run-electron-node.mjs tests/smoke/logging-smoke.ts` |
| 本地开发 | `pnpm dev` |
| 打包目录 | `pnpm pack` |
| 分发包 | `pnpm dist` |

## 自检清单

### 通用

- [ ] 任务落点正确，没有改参考项目目录。
- [ ] 没有还原或覆盖用户已有改动。
- [ ] 新增逻辑复用了现有边界。
- [ ] 运行了匹配风险的验证。

### IPC

- [ ] constants、shared bridge type、domain handler、preload、renderer bridge 已同步。
- [ ] 新增通用 handler 已接入 `electron/ipc/index.ts` 并复用统一注册包装。
- [ ] renderer 没有直接访问 Node/Electron/数据库。
- [ ] 事件订阅有 unsubscribe。

### 配置

- [ ] shared type、默认值、normalize、validate、UI/store 已同步。
- [ ] Provider registry 没有混入桌面配置或数据库表。
- [ ] autosave 和 fallback bridge 行为已核对。
- [ ] 秘密信息没有回显。

### 数据库

- [ ] schema 变更有 migration，符合 [core.md](core.md) 的数据库专题。
- [ ] repo 映射和 shared 类型已同步。
- [ ] migration 幂等，空库可运行。

### 前端

- [ ] 复用了 shadcn-vue 组件和语义 token。
- [ ] 设置页和 Provider 页 draft/autosave 未破坏。
- [ ] loading、disabled、error 状态合理。

### Chat / Agent

- [ ] run、message、stream event 状态一致。
- [ ] abort 路径可结束。
- [ ] Provider 错误归一化。
- [ ] 工具风险和权限边界已核对。
- [ ] workspace/terminal profile、approval、full access 边界已核对。
