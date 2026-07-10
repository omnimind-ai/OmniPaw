# 变更验证与交付约束

## 通用约束

- MUST：只修改任务范围内的文件，并保留用户已有改动。
- MUST：跨层契约变更覆盖全部生产者、适配层、消费者和测试。
- MUST：验证范围与变更风险匹配；高风险变更不得仅以静态检查替代运行时验证。
- MUST：失败的验证不得被描述为通过；已知无关失败必须与本次变更结果分开报告。
- MUST：未运行、无法运行或无法人工确认的关键验证在交付中明确说明。
- MUST：验证命令不得修改、格式化或删除无关用户文件。

## 基础验证

- SHOULD：TypeScript、Vue、shared 契约或 core 变更通过 `pnpm typecheck`。
- MUST：main、preload、Electron adapter、Vite 入口、桌宠入口或打包边界变更通过 `pnpm build`。
- MUST：架构边界变更通过 `tests/smoke/architecture-boundaries-smoke.ts`。
- MAY：纯文档变更只执行 Markdown、链接、路径和 diff 检查。

## 领域验证矩阵

| 变更范围 | 必须覆盖的 smoke 边界 |
|----------|----------------------|
| 桌面设置与 schema | `settings-config-smoke.ts` |
| Provider registry | `provider-registry-smoke.ts` |
| Provider 流与协议 | `provider-stream-smoke.ts` |
| 数据库、migration、repo | `db-smoke.ts` |
| 聊天服务与消息运行 | `chat-core-smoke.ts` |
| 上下文预算与 Agent 上下文 | `agent-context-smoke.ts` |
| Agent 执行 | `agent-runtime-smoke.ts` |
| 工具 catalog、开关与 policy | `tool-management-smoke.ts` |
| Workspace 与 terminal | `local-agent-smoke.ts` |
| MCP | `mcp-management-smoke.ts` |
| Skill | `skill-management-smoke.ts` |
| Observation manager | `observation-manager-smoke.ts` |
| Observation bridge | `observation-bridge-smoke.ts` |
| 日志 | `logging-smoke.ts` |
| 桌宠命中、拖动与文件投递 | `cat-window-input-smoke.ts` |
| 桌宠形象包 | `cat-appearance-smoke.ts` |

- MUST：一个变更跨越多个领域时覆盖矩阵中的所有相关边界。
- SHOULD：难以可靠映射到单个领域的系统性变更运行完整 `pnpm test`。
- SHOULD：UI 行为变更使用现有 Playwright 或真实 Electron 验证；测试与当前 UI 不一致时不得用过期断言判定产品行为。

## 验证入口

| 目的 | 入口 |
|------|------|
| 全部 smoke | `pnpm test` |
| 类型检查 | `pnpm typecheck` |
| 完整构建 | `pnpm build` |
| 单个 smoke | `node scripts/run-electron-node.mjs tests/smoke/<name>.ts` |
| 本地开发 | `pnpm dev` |
| 打包目录 | `pnpm pack` |
| 分发包 | `pnpm dist` |

## 领域自检

### IPC 与架构

- [ ] channel、shared payload、bridge、handler、preload 和 renderer 消费方一致。
- [ ] renderer 没有 Node/Electron/core 依赖，core 没有 Electron 依赖。
- [ ] 订阅、窗口和长任务具备清理语义。

### 配置与数据库

- [ ] 配置权威来源没有混合，秘密字段没有回显。
- [ ] schema 变更有新 migration，repo 和 shared 类型一致。
- [ ] migration、备份和失败恢复语义得到验证。

### 前端

- [ ] store、draft、持久化对象和异步状态保持分离。
- [ ] UI 使用现有组件、tokens、反馈和国际化边界。
- [ ] 生命周期资源已释放。

### Chat / Agent

- [ ] session、message、run、stream event 和 abort 终态一致。
- [ ] Provider 错误、fallback、凭据和模型选择边界一致。
- [ ] 工具、MCP、workspace 和 terminal 权限边界没有扩大。

### Desktop pet

- [ ] 视觉窗与命中窗的位置、缩放、显示状态和命中区域同步。
- [ ] 透明、置顶、点击穿透、拖动和文件投递语义未退化。
- [ ] 动画、订阅、计时器和窗口销毁路径完成清理。
