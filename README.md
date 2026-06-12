<div align="center">

<img src="public/brand-logo.png" alt="OpenOmniClaw Logo" style="width:140px;" />

# OpenOmniClaw

**A desktop AI assistant and Agent client for edge-side models**

English | [简体中文](README.zh-CN.md)

[![Electron](https://img.shields.io/badge/Electron-36-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vue](https://img.shields.io/badge/Vue-3-42B883?style=flat-square&logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License](https://img.shields.io/badge/License-AGPL--3.0%20%2B%20Commercial-blue?style=flat-square)](LICENSE)

</div>

OpenOmniClaw is a desktop AI assistant client designed to make locally deployed or LAN-hosted OpenAI-compatible models easier to use in everyday workflows. It provides chat, tavern role-play, visual observation, Skills, MCP, Agent tools, scheduled tasks, and other local-first capabilities.

## Features

- **OpenAI-compatible model services** - Configure OpenAI-compatible providers, model lists, default models, and fallback models
- **Desktop cat assistant** - Floating window, notification bubbles, session entry points, and runtime state sync
- **Persona and context management** - Persona profiles, system context, attachment context, and automatic compaction policies
- **Agent tooling** - Skills, MCP, local workspace, terminal process management, and configurable tool permissions
- **Scheduled tasks and proactive observation** - Scheduled task execution, visual observation, and notification feedback
- **Local-first data** - Config, providers, personas, SQLite data, attachments, skill state, and logs are stored locally by default

## Screenshots

<p align="center">
  <img src="public/hello.png" alt="OpenOmniClaw main screen" width="100%" />
</p>

<table>
  <tr>
    <td width="50%">
      <img src="public/traven.png" alt="Tavern role-play session" />
    </td>
    <td width="50%">
      <img src="public/corn.png" alt="Scheduled tasks and tool calls" />
    </td>
  </tr>
  <tr>
    <td align="center"><strong>Tavern Session</strong></td>
    <td align="center"><strong>Scheduled Tasks and Tool Calls</strong></td>
  </tr>
  <tr>
    <td colspan="2">
      <img src="public/version.png" alt="Visual observation and desktop assistant" />
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center"><strong>Visual Observation and Desktop Assistant</strong></td>
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

## First Use

1. Start the app and open Settings.
2. Add an OpenAI-compatible provider under Model Services.
3. Select the default chat model and fallback models under Default Models.
4. Enable Persona, Tavern, Skills, MCP, local Agent tools, scheduled tasks, or visual observation as needed.

## Local Models (OmniInfer)

OpenOmniClaw can run small GGUF models locally via the embedded OmniInfer runtime.

### Distribution Variants

- **Full build** (`pnpm build:full`): bundles the OmniInfer binary under `resources/omniinfer/` via electron-builder `extraResources`. Users get a turnkey experience — drop a `.gguf` into the models directory and chat.
- **Slim build** (`pnpm build:slim`): omits the OmniInfer binary to reduce installer size by hundreds of MB. Users supply OmniInfer themselves by either placing it in the install directory under `resources/omniinfer/` or setting `OMNICLAW_OMNIINFER_PATH` to the binary path.

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
