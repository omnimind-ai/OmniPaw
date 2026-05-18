# OpenOmniClaw Electron

OpenOmniClaw desktop client built with Electron, electron-vite, Vue 3, and TypeScript.

## Requirements

- Node.js 22.12 or newer
- pnpm 10.x

## Scripts

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm format
pnpm run pack
pnpm dist
```

`pnpm dev` starts the electron-vite development server.
`pnpm build` runs Vue/TypeScript type checks and builds Electron main, preload, and renderer bundles.
`pnpm lint` runs TypeScript checks and Biome linting.
`pnpm format` formats supported project files with Biome.
`pnpm run pack` creates an unpacked app under `release/win-unpacked`.
`pnpm dist` creates a distributable installer under `release`.

## Project Structure

```text
electron/
  main.ts      Electron main process, window lifecycle, IPC registration
  preload.ts   Safe bridge between renderer and main process
core/          Business logic that runs from the main process
shared/        Shared constants and TypeScript contracts
src/           Vue renderer application
resources/     Packaged static resources
```

The renderer runs with `contextIsolation` enabled and Node integration disabled.
