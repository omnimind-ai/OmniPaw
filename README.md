<div align="center">

<img src="assets/brand-logo.png" alt="OpenOmniClaw Logo" style="width:140px;" />

# OpenOmniClaw

**面向端侧模型的桌面 AI 助手与 Agent 客户端**

[![Electron](https://img.shields.io/badge/Electron-36-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vue](https://img.shields.io/badge/Vue-3-42B883?style=flat-square&logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License](https://img.shields.io/badge/License-AGPL--3.0%20%2B%20Commercial-blue?style=flat-square)](LICENSE)

</div>

OpenOmniClaw 是一个面向桌面环境的 AI 助手客户端，目标是让本地部署或局域网内的 OpenAI 兼容模型更容易接入日常工作流。提供聊天、酒馆、视觉观察、技能/MCP/Agent 工具/计划任务等能力

## 特性

- **OpenAI 兼容模型服务** - 支持配置 OpenAI-compatible Provider、模型列表、默认模型和备用模型
- **桌面小猫助手** - 提供悬浮窗、通知气泡、会话入口和运行状态联动
- **Persona 与上下文管理** - 支持人格配置、系统上下文、附件上下文和自动压缩策略
- **Agent 工具能力** - 支持 Skills、MCP、本地 workspace、terminal process 和工具权限配置
- **计划任务与主动观察** - 支持定时任务、视觉观察和通知反馈
- **本地数据优先** - 配置、Provider、Persona、SQLite、附件、技能状态和日志默认保存在本机

## 截图



## 技术栈

| 层级 | 技术 |
|------|------|
| **桌面框架** | [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/) |
| **前端** | [Vue 3](https://vuejs.org/) + [TypeScript](https://www.typescriptlang.org/) |
| **路由与状态** | [Vue Router](https://router.vuejs.org/) + [Pinia](https://pinia.vuejs.org/) |
| **UI** | [shadcn-vue](https://www.shadcn-vue.com/) + [Reka UI](https://reka-ui.com/) + [Tailwind CSS v4](https://tailwindcss.com/) |
| **数据库** | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| **构建与质量** | [Vite](https://vite.dev/) + [vue-tsc](https://github.com/vuejs/language-tools) + [Biome](https://biomejs.dev/) |

## 安装

### 从 Release 下载

Release 安装包尚未整理发布。当前阶段建议从源码启动或构建。

### 从源码运行

#### 前置要求

- [Node.js](https://nodejs.org/) `>=22.12.0`
- [pnpm](https://pnpm.io/) `10.x`

#### 启动开发环境

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会先重建 Electron 原生依赖，再启动桌面开发环境。

#### 构建生产版本

```bash
pnpm build
```

#### 预览构建产物

```bash
pnpm start
```

#### 打包应用

```bash
pnpm pack
pnpm dist
```

## 🚀 首次使用

1. 启动应用后打开「设置」。
2. 在「模型服务」中添加 OpenAI 兼容 Provider。
3. 在「默认模型」中选择默认聊天模型和备用模型。
4. 按需启用 Persona、酒馆、技能、MCP、本地 Agent、计划任务或视觉观察。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。新增功能前建议先通过 Issue 说明场景、交互入口和数据边界，避免和当前 Electron / core / renderer 分层冲突。

## 📄 开源协议

本项目采用分段双重许可模式：非商业、个人、教育或研究用途遵循 AGPL v3；商业用途需要商业授权。详情请阅读 [LICENSE](LICENSE)。
