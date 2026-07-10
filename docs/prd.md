# OmniPaw 产品约束

## 产品定位

- MUST：OmniPaw 是开箱即用的 Electron 桌面助手，而不是通用 Agent 平台或网关管理器。
- MUST：产品优先支持日常办公、桌面互动和轻量陪伴场景。
- MUST：OmniInfer 是核心本地模型运行能力，产品体验应突出本地部署与端侧模型优化价值。
- SHOULD：默认体验面向约 7B–20B 级别的端侧模型，避免以超大模型能力作为基本可用前提。
- SHOULD：配置项保持用户可理解，复杂能力不得无条件暴露为首屏负担。

## 技术与架构

- MUST：桌面运行时使用 Electron，renderer 使用 Vue 3 + TypeScript。
- MUST：UI、Electron 平台适配、业务 core 和跨进程 shared 契约保持分层。
- MUST：renderer 不能直接访问数据库、文件系统、模型进程或 Provider 凭据。
- MUST：本地模型、OpenAI 兼容 Provider、上下文、Skill、工具和定时任务共享统一的聊天与 Agent 运行边界。
- MUST：桌宠作为独立跨进程功能包维护，不得重新散落到根目录、通用 renderer 或 main 启动文件。

## 范围控制

- MUST：新增高级能力前证明其符合桌面助手定位，并能在默认配置下保持可发现、可理解和可关闭。
- MUST：不得为了兼容旧架构重新引入 gateway/sidecar 式 UI-core 耦合或庞大的外部项目依赖面。
- SHOULD：优先完善现有聊天、桌宠、本地模型、上下文、Skill、工具和定时任务体验，再扩展新的平台级能力。
