# Desktop pet feature package

This directory owns the Electron floating-pet feature as one source package.

- `electron/controller.ts`: BrowserWindow lifecycle, placement, topmost behavior, and window IPC.
- `entries/`: Vite HTML entry points. These stay declarative and only select a renderer.
- `renderer/visual/`: click-through visual window, appearance resolution, lifecycle state machine,
  and DOM rendering adapter.
- `renderer/input/`: shaped hit window, pointer dragging, context menu, and file dropping.
- `renderer/panel/`: Vue chat/status panel and its local controllers.
- `renderer/bubble/`: Vue notification and gift bubble.

The package deliberately consumes shared contracts from `shared/` and application services through
`src/bridge/app.ts`. Renderer code must not import Electron or Node APIs. The application bootstrap
imports the Electron controller directly from this package.
