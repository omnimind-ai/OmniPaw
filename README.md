<div align="center">

<img src="public/brand-logo.png" alt="OmniPaw Logo" style="width:140px;" />

**Understand your AI desktop pet better, work with you, accompany you by your side**

English | [简体中文](README.zh-CN.md)

[![Electron](https://img.shields.io/badge/Electron-36-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vue](https://img.shields.io/badge/Vue-3-42B883?style=flat-square&logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License](https://img.shields.io/badge/License-AGPL--3.0%20%2B%20Commercial-blue?style=flat-square)](LICENSE)

</div>

OmniPaw is a local-first AI desktop pet that lives on your desktop and gradually gets to know you through everyday interactions. It can see and remember what you are doing, work alongside you, and keep you company throughout the day. Choose its character and appearance, build affection, watch its mood change, and unlock gifts as your bond grows.

## Features

- **Continuous visual awareness** - With your permission, your pet can observe your desktop, understand what you are doing, and remember the things you enjoy and do often
- **A relationship that grows** - Affection and daily interactions make every moment part of an ongoing relationship—and your pet may even surprise you with a gift
- **A character and look of your own** - Deep customization lets you create a truly unique companion, while character card import and export make it easy to share your creation with the community
- **Works alongside you** - A capable Agent harness, scheduled reminders, and task execution help you stay productive without leaving your current workflow
- **Agent capabilities behind the companion** - Extend what your pet can do with Skills, MCP, a local workspace, terminal processes, and configurable tool permissions

## Screenshots

<p align="center">
  <img src="public/version.png" alt="OmniPaw desktop pet observing the screen and responding with a notification bubble" width="100%" />
  <br />
  <strong>Desktop Pet, Visual Observation, and Proactive Feedback</strong>
</p>

<table>
  <tr>
    <td width="50%">
      <img src="public/traven.png" alt="OmniPaw character and role-play context" />
    </td>
    <td width="50%">
      <img src="public/corn.png" alt="Scheduled tasks and tool calls" />
    </td>
  </tr>
  <tr>
    <td align="center"><strong>Characters and Role-play Context</strong></td>
    <td align="center"><strong>Scheduled Tasks and Tool Calls</strong></td>
  </tr>
  <tr>
    <td colspan="2">
      <img src="public/hello.png" alt="OmniPaw focused chat workspace" />
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center"><strong>Focused Chat Workspace</strong></td>
  </tr>
</table>

## Tech Stack

| Layer | Technology |
|------|------|
| **Desktop Framework** | [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/) |
| **Frontend** | [Vue 3](https://vuejs.org/) + [TypeScript](https://www.typescriptlang.org/) |
| **Routing and State** | [Vue Router](https://router.vuejs.org/) + [Pinia](https://pinia.vuejs.org/) |
| **UI** | [shadcn-vue](https://www.shadcn-vue.com/) + [Reka UI](https://reka-ui.com/) + [Tailwind CSS v4](https://tailwindcss.com/) |
| **Database** | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| **Build and Quality** | [Vite](https://vite.dev/) + [vue-tsc](https://github.com/vuejs/language-tools) + [Biome](https://biomejs.dev/) |

## Installation

### Download from Releases

Release packages are not available yet. For now, run or build the app from source.

### Run from Source

#### Requirements

- [Node.js](https://nodejs.org/) `>=22.12.0`
- [pnpm](https://pnpm.io/) `10.x`

#### Start the Development Environment

```bash
pnpm install
pnpm dev
```

`pnpm dev` rebuilds Electron native dependencies first, then starts the desktop development environment.

#### Build for Production

```bash
pnpm build
```

#### Preview the Built App

```bash
pnpm start
```

#### Package the App

```bash
pnpm pack
pnpm dist
```

## Local Models (OmniInfer)

OmniPaw can run small GGUF models locally via the embedded OmniInfer runtime.

### Distribution Variants

- **Full build** (`pnpm build:full`): bundles the OmniInfer binary under `resources/omniinfer/` via electron-builder `extraResources`. Users get a turnkey experience — drop a `.gguf` into the models directory and chat.
- **Slim build** (`pnpm build:slim`): omits the OmniInfer binary to reduce installer size by hundreds of MB. Users supply OmniInfer themselves by either placing it in the install directory under `resources/omniinfer/` or setting `OMNIPAW_OMNIINFER_PATH` to the binary path.

### Bundling OmniInfer for the Full Build

Developers must drop an OmniInfer release (e.g. from the OmniStudio release package) into `resources/omniinfer/` before running `pnpm build:full`. The directory is `.gitignore`d except for `.gitkeep`. The build pre-check (`scripts/check-omniinfer-resources.mjs`) warns if expected binaries are missing.

### Models Directory

- Production: `<userData>/models/` (auto-created on first run)
- Development: if `<repo-root>/models/` exists, it overrides the userData path

Override at runtime via the `OMNIINFER_MODELS_DIR_OVERRIDE` environment variable.

### Using a Local Model

1. Place a `.gguf` file into the models directory, or use the "选择本地 .gguf" button in **Settings → 本地模型** to point to a file anywhere on disk.
2. The Settings panel shows the OmniInfer process state (`运行中` / `已停止` / `未内置` / ...) and the list of installed models.
3. Click "加载" on a model to invoke `/omni/model/select`; the badge "已加载" appears once OmniInfer reports the model ready.
4. In **设置 → 模型服务** make sure the `OmniInfer Local` provider is enabled, then select it in any chat session and start talking — the provider lazily ensures the right model is loaded before sending the request.

### Logs

OmniInfer process stdout/stderr is written under `<app logs>/omniinfer/`. Open the directory via the "查看日志" button in the Local Models settings.

## Contributing

Issues and pull requests are welcome. Before adding a new feature, please open an issue to describe the use case, UI entry point, and data boundary so it fits the current Electron / core / renderer architecture.

## License

This project uses a segmented dual-licensing model. Non-commercial, personal, educational, or research use is available under AGPL v3. Commercial use requires a commercial license. See [LICENSE](LICENSE) for details.
