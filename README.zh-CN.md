<div align="center">

<img src="public/brand-logo.png" alt="OmniPaw Logo" style="width:140px;" />

**更懂你的 AI 桌面宠物，与你工作，伴你身边**

[English](README.md) | 简体中文

[![Electron](https://img.shields.io/badge/Electron-36-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vue](https://img.shields.io/badge/Vue-3-42B883?style=flat-square&logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License](https://img.shields.io/badge/License-AGPL--3.0%20%2B%20Commercial-blue?style=flat-square)](LICENSE)

</div>

OmniPaw 是一只本地优先的 AI 桌面宠物。它常驻在你的桌面，在日常互动中逐渐了解你，他能看到并记住你再干什么，陪你一起完成工作。你可以选择它的角色与形象，在相处中培养好感、感受心情变化并解锁礼物

## 特性
- **持续的视觉能力** - 查看你的桌面，了解你在做什么，你喜欢做的，经常做的，它都能记住，当然，在你允许的前提下
- **持续成长的关系** - 好感度、每日互动、让每一次相处都能延续下来、或许能收到宠物的礼物？
- **属于你的角色与形象** - 更高 的自定义程度，让你拥有自己专属的角色，并支持按需导入导出角色卡，让社区更了解你的角色
- **与你一起工作** - 支持较完整的agent harness、计划提醒、工作任务，无需离开当前工作环境
- **藏在陪伴背后的 Agent 能力** - 通过 Skills、MCP、本地工作区、终端进程与工具权限扩展桌宠能完成的事情

## 截图

<p align="center">
  <img src="public/version.png" alt="OmniPaw 桌宠观察屏幕并通过通知气泡回应" width="100%" />
  <br />
  <strong>桌宠陪伴、视觉观察与主动反馈</strong>
</p>

<table>
  <tr>
    <td width="50%">
      <img src="public/traven.png" alt="OmniPaw 角色与角色扮演上下文" />
    </td>
    <td width="50%">
      <img src="public/corn.png" alt="计划任务与工具调用" />
    </td>
  </tr>
  <tr>
    <td align="center"><strong>角色与角色扮演上下文</strong></td>
    <td align="center"><strong>计划任务与工具调用</strong></td>
  </tr>
  <tr>
    <td colspan="2">
      <img src="public/hello.png" alt="OmniPaw 专注聊天工作区" />
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center"><strong>专注聊天工作区</strong></td>
  </tr>
</table>

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

## 贡献

欢迎提交 Issue 和 Pull Request。新增功能前建议先通过 Issue 说明场景、交互入口和数据边界，避免和当前 Electron / core / renderer 分层冲突。

## 开源协议

本项目采用分段双重许可模式：非商业、个人、教育或研究用途遵循 AGPL v3；商业用途需要商业授权。详情请阅读 [LICENSE](LICENSE)。
