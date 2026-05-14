# OpenOmniClaw Electron

OpenOmniClaw desktop client built with Electron.

## Requirements

- Node.js 22.12 or newer
- pnpm 10.x

## Scripts

```bash
pnpm install
pnpm dev
pnpm lint
pnpm run pack
pnpm dist
```

`pnpm run pack` creates an unpacked app under `release/win-unpacked`.
`pnpm dist` creates a distributable installer under `release`.

## Project Structure

```text
src/
  main/       Electron main process
  preload/    Safe bridge between renderer and main process
  renderer/   Browser UI
```

The renderer runs with `contextIsolation` enabled and Node integration disabled.
