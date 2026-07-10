import { readFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import type { ChatRunEventTarget } from '@core/chat/run-manager'
import { createProjectLogger } from '@core/logging'
import { OmniInferRuntimeClient, resolveModelsDir } from '@core/omniinfer'
import { resolveOmniPawDataPaths } from '@core/utils/data-paths'
import {
  APP_ID,
  APP_NAME,
  BACKGROUND_ASSET_PROTOCOL,
  CAT_APPEARANCE_ASSET_PROTOCOL,
  IPC_CHANNELS,
} from '@shared/constants'
import type { OpenChatSessionRequest } from '@shared/types/app'
import type { CatAppearanceAssetKey, CatAppearanceChangedEvent } from '@shared/types/cat-appearance'
import type { CatPetChangedEvent, CatPetGiftUnlock } from '@shared/types/cat-pet'
import type { ChatSessionChangedEvent } from '@shared/types/chat'
import type { CronTaskChangedEvent } from '@shared/types/cron'
import type { ObservationChangedEvent, ObservationReactionEvent } from '@shared/types/observation'
import type {
  DesktopSettingsChangedEvent,
  DesktopSettingsConfig,
  SettingsChangeReason,
} from '@shared/types/settings'
import type { ShortcutAction, ShortcutStatusChangedEvent } from '@shared/types/shortcuts'
import { app, BrowserWindow, Menu, type MenuItemConstructorOptions, protocol } from 'electron'
import {
  closeCatWindow,
  getActiveCatSessionId,
  getCatWindowBounds,
  openCatPanelWindow,
  registerCatWindowIpcHandlers,
  sendCatObservationReaction,
  setActiveCatSessionId,
  setCatSessionIdResolver,
  setCatWindowLogger,
  showCatWindow,
  showCatWindowBubble,
  toggleCatPanelWindow,
  toggleCatVisibility,
} from '../packages/desktop-pet/electron/controller'
import { createAppIconImage, resolveAppIconPath } from './app-icon'
import {
  type CatNotificationController,
  createCatNotificationController,
} from './cat-notification-controller'
import {
  type CoreRuntime,
  createCoreRuntime,
  type McpChangedEvent,
  type SkillChangedEvent,
} from './core-runtime'
import { registerIpcHandlers } from './ipc'
import { createElectronLogSink } from './logging/electron-log-adapter'
import { createMainWindowController, type MainWindowController } from './main-window'
import { locateOmniInferInstall } from './omniinfer/binary-locator'
import { defaultOmniInferLogsDir, OmniInferProcess } from './omniinfer/process'
import { createShortcutController, type ShortcutController } from './shortcut-controller'
import { createTrayController, type TrayController } from './tray'

const appVersion = app.getVersion() || __APP_VERSION__
const appBuildTime = __BUILD_TIME__
const appCommit = __GIT_COMMIT__
const omniInferPackaged = __OMNIINFER_PACKAGED__

const logSink = createElectronLogSink({
  logDir: resolveAppLogsPath(),
  appName: APP_NAME,
  appVersion,
})
const rootLogger = createProjectLogger({
  sink: logSink,
  scope: 'desktop',
  meta: {
    pid: process.pid,
    processType: process.type ?? 'main',
    appVersion,
    platform: process.platform,
  },
})
const mainLogger = rootLogger.child({ scope: 'main' })
const ipcLogger = mainLogger.child({ scope: 'ipc' })
const lifecycleLogger = mainLogger.child({ scope: 'lifecycle' })

let runtime: CoreRuntime | undefined
let mainWindowController: MainWindowController | undefined
let trayController: TrayController | undefined
let catNotificationController: CatNotificationController | undefined
let shortcutController: ShortcutController | undefined
let omniInferProcess: OmniInferProcess | undefined
let isQuitting = false
let catAppearanceAssetProtocolRegistered = false
let backgroundAssetProtocolRegistered = false
const ZOOM_STEP = 0.05

protocol.registerSchemesAsPrivileged([
  {
    scheme: BACKGROUND_ASSET_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
  {
    scheme: CAT_APPEARANCE_ASSET_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
])

enablePlatformFeatures()
registerProcessDiagnostics()

function enablePlatformFeatures(): void {
  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_ID)
  }

  if (process.platform === 'linux') {
    app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')
  }
}

function applyApplicationIcon(): void {
  if (process.platform !== 'darwin') {
    return
  }

  const icon = createAppIconImage(app)
  if (icon.isEmpty()) {
    lifecycleLogger.warn('Unable to load application icon.', {
      iconPath: resolveAppIconPath(app),
    })
    return
  }

  app.dock?.setIcon(icon)
}

function resolveAppLogsPath(): string {
  try {
    return resolveOmniPawDataPaths({ appDataPath: app.getPath('appData') }).logs
  } catch {
    try {
      return resolveOmniPawDataPaths().logs
    } catch {
      return join(process.cwd(), 'omnipaw', 'logs')
    }
  }
}

function registerProcessDiagnostics(): void {
  process.on('uncaughtExceptionMonitor', (error, origin) => {
    mainLogger.error('Uncaught exception observed.', { origin, error })
  })
  process.on('unhandledRejection', (reason) => {
    mainLogger.error('Unhandled promise rejection observed.', { error: reason })
  })
  app.on('child-process-gone', (_event, details) => {
    mainLogger.error('Child process ended unexpectedly.', {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName,
      name: details.name,
    })
  })
}

function createControllers(): void {
  mainWindowController = createMainWindowController({
    app,
    appName: APP_NAME,
    logger: mainLogger,
    isQuitting: () => isQuitting,
    setQuitting: markQuitting,
    shouldMinimizeToTray: isMinimizeToTrayEnabled,
    zoomFactor: getConfiguredZoomFactor,
    onHiddenToTray: updateTrayMenu,
    onClosed: closeCatWindow,
    showCatWindow: () => {
      showCatWindow()
    },
  })

  trayController = createTrayController({
    app,
    appName: APP_NAME,
    devActions: {
      debugUnlockNextGift: () =>
        runDevTrayAction('cat-pet.debugUnlockNextGift', debugUnlockNextGiftFromTray),
      triggerObservationReaction: () =>
        runDevTrayAction('observation.triggerDevReaction', triggerDevObservationReactionFromTray),
      showDirectCatBubble: () =>
        runDevTrayAction('cat.showDirectDevBubble', showDirectDevCatBubbleFromTray),
    },
    isDevMode,
    quitApp,
    shouldMinimizeToTray: isMinimizeToTrayEnabled,
    showMainWindow,
  })
}

function markQuitting(): void {
  isQuitting = true
}

function quitApp(): void {
  markQuitting()
  catNotificationController?.destroy()
  shortcutController?.destroy()
  closeCatWindow()
  trayController?.destroy()
  app.quit()
}

function showMainWindow(): void {
  mainWindowController?.show()
}

function openMainChatSession(sessionId: string, kind?: OpenChatSessionRequest['kind']): void {
  showMainWindow()
  const window = mainWindowController?.getWindow()
  if (!window || window.isDestroyed()) {
    return
  }

  const request: OpenChatSessionRequest = { sessionId, kind }
  const send = () => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.app.navigateToChat, request)
    }
  }

  if (window.webContents.isLoading()) {
    window.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

function updateTrayMenu(): void {
  trayController?.updateMenu()
}

function updateApplicationMenu(): void {
  const currentZoom = getConfiguredZoomFactor()
  const zoomBounds = getConfiguredZoomBounds()
  const zoomInAccelerator = getConfiguredShortcutAccelerator('app.zoomIn', 'CmdOrCtrl+=')
  const zoomOutAccelerator = getConfiguredShortcutAccelerator('app.zoomOut', 'CmdOrCtrl+-')
  const zoomResetAccelerator = getConfiguredShortcutAccelerator('app.zoomReset', 'CmdOrCtrl+0')
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    })
  }

  template.push(
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: `缩放比例：${formatZoomPercent(currentZoom)}`,
          enabled: false,
        },
        { type: 'separator' },
        {
          label: '放大',
          ...(zoomInAccelerator ? { accelerator: zoomInAccelerator } : {}),
          enabled: currentZoom < zoomBounds.max,
          click: () => stepConfiguredZoomFactor(1),
        },
        {
          label: '缩小',
          ...(zoomOutAccelerator ? { accelerator: zoomOutAccelerator } : {}),
          enabled: currentZoom > zoomBounds.min,
          click: () => stepConfiguredZoomFactor(-1),
        },
        {
          label: '重置缩放',
          ...(zoomResetAccelerator ? { accelerator: zoomResetAccelerator } : {}),
          enabled: currentZoom !== getConfiguredDefaultZoomFactor(),
          click: resetConfiguredZoomFactor,
        },
      ],
    }
  )

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function isMinimizeToTrayEnabled(): boolean {
  try {
    return runtime?.configStore.get().app.minimizeToTrayOnStartup ?? false
  } catch {
    return false
  }
}

function getConfiguredZoomFactor(config = runtime?.configStore.get()): number {
  const bounds = getConfiguredZoomBounds(config)
  const zoom = config?.app.zoom
  if (!zoom) {
    return 1
  }

  const factor = Number.isFinite(zoom.factor) ? zoom.factor : 1
  return clampZoomFactor(factor, bounds)
}

function getConfiguredShortcutAccelerator(
  action: ShortcutAction,
  fallback: string
): string | undefined {
  const binding = runtime?.configStore.get().app.shortcuts.bindings[action]
  if (!binding) {
    return fallback
  }
  return binding.accelerator
}

function getConfiguredZoomBounds(config = runtime?.configStore.get()): {
  min: number
  max: number
} {
  const zoom = config?.app.zoom
  const minSource = zoom?.min
  const maxSource = zoom?.max
  const min =
    typeof minSource === 'number' && Number.isFinite(minSource) && minSource > 0 ? minSource : 0.75
  const max =
    typeof maxSource === 'number' && Number.isFinite(maxSource) && maxSource >= min
      ? maxSource
      : 1.5
  return { min, max }
}

function getConfiguredDefaultZoomFactor(config = runtime?.configStore.get()): number {
  return clampZoomFactor(1, getConfiguredZoomBounds(config))
}

function applyMainWindowZoom(config?: DesktopSettingsConfig): void {
  mainWindowController?.applyZoomFactor(getConfiguredZoomFactor(config))
}

function applyMainWindowBackground(config?: DesktopSettingsConfig): void {
  mainWindowController?.applyBackgroundSettings(config?.app.background)
}

function stepConfiguredZoomFactor(direction: 1 | -1): void {
  updateConfiguredZoomFactor(getConfiguredZoomFactor() + direction * ZOOM_STEP)
}

function resetConfiguredZoomFactor(): void {
  updateConfiguredZoomFactor(getConfiguredDefaultZoomFactor())
}

function updateConfiguredZoomFactor(nextFactor: number): void {
  if (!runtime) {
    return
  }

  try {
    const config = runtime.configStore.get()
    const nextZoomFactor = roundZoomFactor(
      clampZoomFactor(nextFactor, getConfiguredZoomBounds(config))
    )
    if (config.app.zoom.factor === nextZoomFactor) {
      applyMainWindowZoom(config)
      updateApplicationMenu()
      return
    }

    config.app.zoom.factor = nextZoomFactor
    const saved = runtime.configStore.save(config)
    broadcastSettingsChanged('save', saved)
  } catch (error) {
    mainLogger.warn('Unable to update zoom factor.', { error })
  }
}

function clampZoomFactor(value: number, bounds: { min: number; max: number }): number {
  const factor = Number.isFinite(value) ? value : 1
  return Math.min(bounds.max, Math.max(bounds.min, factor))
}

function roundZoomFactor(value: number): number {
  return Math.round(value * 100) / 100
}

function formatZoomPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function getRuntimeSessionKind(sessionId: string): string | undefined {
  const session = runtime?.sessionRepo.get(sessionId)
  return typeof session?.kind === 'string' ? session.kind : undefined
}

function normalizeSessionId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized || null
}

async function resolveRuntimeCatSessionId(
  preferredSessionId?: string | null
): Promise<string | null> {
  if (!runtime) {
    return null
  }

  const preferred = normalizeSessionId(preferredSessionId)
  const active = normalizeSessionId(getActiveCatSessionId())

  try {
    const session = await runtime.chatService.getOrCreateSession({
      kind: 'cat',
      preferredIds: [preferred, active],
      preferredMismatch: 'ignore',
    })
    return session.id
  } catch (error) {
    mainLogger.warn('Unable to create cat session for cat window state.', { error })
    return null
  }
}

function createCatNotificationControllerForRuntime(): CatNotificationController {
  return createCatNotificationController({
    logger: mainLogger.child({ scope: 'cat.notification' }),
    getSessionKind: getRuntimeSessionKind,
    getAnchorBounds: getCatWindowBounds,
    openCatPanel: (sessionId) => {
      setActiveCatSessionId(sessionId, 'notification')
      openCatPanelWindow({ sessionId, source: 'notification' })
    },
  })
}

function broadcastSettingsChanged(
  reason: SettingsChangeReason,
  config: DesktopSettingsConfig
): void {
  if (!runtime) {
    return
  }

  updateTrayMenu()
  applyMainWindowZoom(config)
  applyMainWindowBackground(config)
  updateApplicationMenu()
  shortcutController?.apply(config.app.shortcuts)

  const event: DesktopSettingsChangedEvent = {
    reason,
    config,
    status: runtime.configStore.status(),
  }

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.settings.changed, event)
  }
}

function broadcastMcpChanged(event: McpChangedEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.mcp.changed, event)
  }
}

function broadcastSkillChanged(event: SkillChangedEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.skill.changed, event)
  }
}

function broadcastCatAppearanceChanged(event: CatAppearanceChangedEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.catAppearance.changed, event)
  }
}

function broadcastCatPetChanged(event: CatPetChangedEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.catPet.changed, event)
  }
}

function showCatPetGiftBubble(event: CatPetGiftUnlock): void {
  showCatWindowBubble({
    kind: 'gift',
    text: event.gift.storyLines[0] ?? event.gift.name,
    gift: event,
    source: 'cat-pet-gift',
  })
}

function isDevMode(): boolean {
  return !app.isPackaged
}

function runDevTrayAction(action: string, handler: () => Promise<void>): void {
  if (!isDevMode()) {
    return
  }

  void handler().catch((error) => {
    mainLogger.warn('Tray dev action failed.', { action, error })
  })
}

async function debugUnlockNextGiftFromTray(): Promise<void> {
  if (!runtime) {
    throw new Error('Core runtime is unavailable.')
  }

  const response = runtime.catPetManager.debugUnlockNextGift()
  if (!response.giftUnlock) {
    mainLogger.info('Tray dev gift unlock skipped; no pending gift.')
  }
}

async function triggerDevObservationReactionFromTray(): Promise<void> {
  if (!runtime) {
    throw new Error('Core runtime is unavailable.')
  }

  let state = await runtime.observationManager.status()
  let run = state.activeRuns.find((item) => item.status === 'active')
  if (!run) {
    const settings = runtime.configStore.get().observation
    state = await runtime.observationManager.start({
      scope: settings.defaultScope,
      screenshotRetention: settings.screenshotRetention,
      sourceId: 'tray-dev-reaction',
    })
    run = state.activeRuns.find((item) => item.status === 'active')
  }

  await runtime.observationManager.trigger({
    ...(run ? { runId: run.id } : {}),
    devForceReaction: true,
  })
}

async function showDirectDevCatBubbleFromTray(): Promise<void> {
  showCatWindow()
  await delay(250)
  const event = showCatWindowBubble({
    text: `气泡窗口测试 ${new Date().toLocaleTimeString()}`,
    kind: 'observation',
    autoDismissMs: 7_000,
    source: 'tray-dev-direct-bubble',
  })
  if (!event) {
    throw new Error('Cat bubble window did not accept the dev event.')
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function broadcastCronChanged(event: CronTaskChangedEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.cron.changed, event)
  }
  catNotificationController?.handleCronChanged(event)
}

function broadcastObservationChanged(event: ObservationChangedEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.observation.changed, event)
  }

  const sessionId = event.run?.visionSessionId
  if (!sessionId) {
    return
  }

  const session = runtime?.sessionRepo.get(sessionId)
  if (!session) {
    return
  }

  const chatEvent: ChatSessionChangedEvent = {
    reason: 'observation',
    sessionId,
    session,
  }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.chat.sessionChanged, chatEvent)
  }
}

function broadcastObservationReaction(event: ObservationReactionEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.observation.notification, event)
  }
  sendCatObservationReaction(event)
}

function broadcastShortcutChanged(event: ShortcutStatusChangedEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.shortcuts.changed, event)
  }
}

function createBroadcastChatEventTarget(): ChatRunEventTarget {
  return {
    send(channel, event) {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(channel, event)
      }
    },
  }
}

function buildCatAppearanceAssetUrl(
  packId: string,
  assetKey: CatAppearanceAssetKey,
  version: string
): string {
  const url = new URL(`${CAT_APPEARANCE_ASSET_PROTOCOL}://asset/`)
  url.pathname = `/${encodeURIComponent(packId)}/${encodeURIComponent(assetKey)}`
  url.searchParams.set('v', version)
  return url.toString()
}

function registerCatAppearanceAssetProtocol(): void {
  if (catAppearanceAssetProtocolRegistered) {
    return
  }
  catAppearanceAssetProtocolRegistered = true

  protocol.handle(CAT_APPEARANCE_ASSET_PROTOCOL, async (request) => {
    const parsed = parseCatAppearanceAssetUrl(request.url)
    if (!parsed || !runtime) {
      return new Response('Not found', { status: 404 })
    }

    const asset = runtime.catAppearanceManager.resolveAsset(parsed.packId, parsed.assetKey)
    if (!asset) {
      return new Response('Not found', { status: 404 })
    }

    try {
      const bytes = await readFile(asset.path)
      return new Response(new Uint8Array(bytes), {
        headers: {
          'Content-Type': asset.mimeType,
          'Cache-Control': 'no-store',
        },
      })
    } catch (error) {
      mainLogger.warn('Failed to read cat appearance asset.', {
        packId: parsed.packId,
        assetKey: parsed.assetKey,
        error,
      })
      return new Response('Not found', { status: 404 })
    }
  })
}

function registerBackgroundAssetProtocol(): void {
  if (backgroundAssetProtocolRegistered) {
    return
  }
  backgroundAssetProtocolRegistered = true

  protocol.handle(BACKGROUND_ASSET_PROTOCOL, async (request) => {
    const fileName = parseBackgroundAssetUrl(request.url)
    if (!fileName) {
      return new Response('Not found', { status: 404 })
    }

    const rootPath = resolveOmniPawDataPaths({
      appDataPath: app.getPath('appData'),
    }).backgroundImages
    const assetPath = resolve(rootPath, fileName)
    if (!isInsidePath(rootPath, assetPath)) {
      return new Response('Not found', { status: 404 })
    }

    try {
      const bytes = await readFile(assetPath)
      return new Response(new Uint8Array(bytes), {
        headers: {
          'Content-Type': imageMimeType(assetPath),
          'Cache-Control': 'no-store',
        },
      })
    } catch (error) {
      mainLogger.warn('Failed to read background asset.', { fileName, error })
      return new Response('Not found', { status: 404 })
    }
  })
}

function parseBackgroundAssetUrl(urlText: string): string | undefined {
  try {
    const url = new URL(urlText)
    if (url.hostname !== 'asset') {
      return undefined
    }
    const [fileName] = url.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))
    if (!fileName || fileName !== basename(fileName)) {
      return undefined
    }
    return fileName
  } catch {
    return undefined
  }
}

function isInsidePath(parentPath: string, childPath: string): boolean {
  const relativePath = relative(resolve(parentPath), resolve(childPath))
  return Boolean(relativePath) && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

function imageMimeType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    default:
      return 'image/png'
  }
}

function parseCatAppearanceAssetUrl(
  urlText: string
): { packId: string; assetKey: string } | undefined {
  try {
    const url = new URL(urlText)
    if (url.hostname !== 'asset') {
      return undefined
    }
    const [packId, assetKey] = url.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))
    if (!packId || !assetKey) {
      return undefined
    }
    return { packId, assetKey }
  } catch {
    return undefined
  }
}

app
  .whenReady()
  .then(() => {
    lifecycleLogger.info('Electron app ready.', {
      version: app.getVersion(),
      logDir: logSink.status().logDir,
    })
    applyApplicationIcon()
    registerBackgroundAssetProtocol()
    registerCatAppearanceAssetProtocol()

    const omniInferLocator = locateOmniInferInstall({ app })
    const omniInferLogsDir = defaultOmniInferLogsDir(
      logSink.status().logDir ?? resolveAppLogsPath()
    )
    const modelsDir = resolveModelsDir({
      userDataPath: app.getPath('appData'),
      repoRoot: app.isPackaged ? undefined : process.cwd(),
    })
    const omniInferClient = new OmniInferRuntimeClient()
    omniInferProcess = new OmniInferProcess({
      installDir: omniInferLocator.installDir,
      modelsDir,
      logsDir: omniInferLogsDir,
      client: omniInferClient,
      logger: mainLogger.child({ scope: 'omniinfer.process' }),
    })
    if (!omniInferLocator.installDir) {
      lifecycleLogger.info('OmniInfer install not bundled; automatic runtime start is disabled.', {
        searched: omniInferLocator.searched.slice(0, 10),
      })
    }

    runtime = createCoreRuntime({
      app,
      appName: APP_NAME,
      rootLogger,
      lifecycleLogger,
      onSettingsChanged: broadcastSettingsChanged,
      onCronChanged: broadcastCronChanged,
      onMcpChanged: broadcastMcpChanged,
      onSkillChanged: broadcastSkillChanged,
      onCatAppearanceChanged: broadcastCatAppearanceChanged,
      onCatPetChanged: broadcastCatPetChanged,
      onCatPetGiftUnlocked: showCatPetGiftBubble,
      onObservationChanged: broadcastObservationChanged,
      onObservationReaction: broadcastObservationReaction,
      chatEventTarget: createBroadcastChatEventTarget,
      resolveCatSessionId: () => resolveRuntimeCatSessionId(getActiveCatSessionId()),
      buildCatAppearanceAssetUrl,
      omniInferProcessController: omniInferProcess,
      omniInferLogsDir,
    })
    createControllers()
    setCatWindowLogger(mainLogger.child({ scope: 'cat' }))
    setCatSessionIdResolver(resolveRuntimeCatSessionId)
    shortcutController = createShortcutController({
      logger: mainLogger,
      getSettings: () =>
        runtime?.configStore.get().app.shortcuts ?? {
          bindings: {
            'cat.toggleVisibility': {
              enabled: false,
              accelerator: 'CmdOrCtrl+Alt+K',
            },
            'cat.openPanel': {
              enabled: false,
              accelerator: 'CmdOrCtrl+Alt+P',
            },
            'app.zoomIn': {
              enabled: false,
              accelerator: 'CmdOrCtrl+=',
            },
            'app.zoomOut': {
              enabled: false,
              accelerator: 'CmdOrCtrl+-',
            },
            'app.zoomReset': {
              enabled: false,
              accelerator: 'CmdOrCtrl+0',
            },
          },
        },
      actions: {
        'cat.toggleVisibility': toggleCatVisibility,
        'cat.openPanel': () => {
          toggleCatPanelWindow({ source: 'shortcut', activate: true })
        },
      },
      onChanged: broadcastShortcutChanged,
    })
    shortcutController.apply(runtime.configStore.get().app.shortcuts)
    catNotificationController = createCatNotificationControllerForRuntime()
    catNotificationController.registerIpcHandlers()
    registerCatWindowIpcHandlers()
    registerIpcHandlers({
      appName: APP_NAME,
      appVersion,
      buildTime: appBuildTime,
      commit: appCommit,
      isPackaged: app.isPackaged,
      omniInferPackaged,
      appDataPath: app.getPath('appData'),
      logSink,
      rootLogger,
      ipcLogger,
      platform: process.platform,
      runtime,
      shortcutController,
      onSettingsChanged: broadcastSettingsChanged,
      openChatSession: openMainChatSession,
    })
    updateApplicationMenu()
    trayController?.create()
    mainWindowController?.create()
    applyMainWindowBackground(runtime.configStore.get())

    lifecycleLogger.info('Desktop startup complete.')

    // Asynchronously start OmniInfer and run the initial models scan; never blocks the main window.
    void runtime.omniInferInstalledModels?.scan().catch((error) => {
      lifecycleLogger.warn('OmniInfer installed-models scan failed.', { error })
    })
    void runtime.omniInferRuntimeService?.start().catch((error) => {
      lifecycleLogger.warn('OmniInfer runtime start failed.', { error })
    })

    app.on('activate', () => {
      lifecycleLogger.debug('App activate event.')
      showMainWindow()
    })
  })
  .catch((error) => {
    lifecycleLogger.error('Desktop startup failed.', { error })
    throw error
  })

app.on('before-quit', (event) => {
  lifecycleLogger.info('App before-quit.')
  markQuitting()
  catNotificationController?.destroy()
  shortcutController?.destroy()
  closeCatWindow()
  const omniInferShutdown = runtime?.omniInferRuntimeService?.shutdown()
  if (omniInferShutdown) {
    event.preventDefault()
    Promise.race([omniInferShutdown, new Promise<void>((resolve) => setTimeout(resolve, 3_500))])
      .catch((error) => lifecycleLogger.warn('OmniInfer shutdown errored.', { error }))
      .finally(() => {
        runtime?.dispose()
        trayController?.destroy()
        app.exit(0)
      })
    return
  }
  runtime?.dispose()
  trayController?.destroy()
})

app.on('window-all-closed', () => {
  lifecycleLogger.info('All windows closed.')
  if (process.platform === 'darwin' && !isQuitting) {
    return
  }
  app.quit()
})
