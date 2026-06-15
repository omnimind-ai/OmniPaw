import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { syncOmniInferProviderModels } from '@core/omniinfer'
import { IPC_CHANNELS } from '@shared/constants'
import type {
  GetOmniInferLogsPathResponse,
  InstalledModelRecord,
  OmniInferRuntimeSnapshot,
  PickLocalGgufResponse,
  PickModelsDirResponse,
  PickOmniInferInstallDirResponse,
  RescanInstalledModelsResponse,
  SelectModelRequest,
  SetThinkingRequest,
} from '@shared/types/omniinfer'
import { BrowserWindow, dialog } from 'electron'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerOmniInferIpcHandlers(options: IpcHandlerOptions): void {
  const service = options.runtime.omniInferRuntimeService
  const installedModels = options.runtime.omniInferInstalledModels
  if (!service || !installedModels) {
    options.ipcLogger.warn('OmniInfer runtime service is not configured; IPC disabled.')
    return
  }
  const logger = options.ipcLogger.child({ scope: 'omniinfer' })

  registerLoggedIpcHandler(options, IPC_CHANNELS.omniinfer.getStatus, async () =>
    service.getSnapshot()
  )

  registerLoggedIpcHandler(options, IPC_CHANNELS.omniinfer.start, async () => service.start())

  registerLoggedIpcHandler(options, IPC_CHANNELS.omniinfer.stop, async () => service.stop())

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.omniinfer.selectModel,
    async (_event, request: SelectModelRequest) => {
      const { absolutePath, mmprojPath, contextLength, launchArgs, requestDefaults } =
        resolveModelRequest(request, installedModels)
      const snapshot = await service.selectModelByPath(
        absolutePath,
        { contextLength, launchArgs, requestDefaults },
        mmprojPath
      )
      // Make sure the picked path is in the index and reflected in the provider.
      await syncOmniInferProviderModels({
        providers: options.runtime.providerManager,
        installedModels,
        logger,
      })
      return snapshot
    }
  )

  registerLoggedIpcHandler(options, IPC_CHANNELS.omniinfer.unloadModel, async () =>
    service.unloadModel()
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.omniinfer.setThinking,
    async (_event, request: SetThinkingRequest) => service.setThinking(request.enabled)
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.omniinfer.getLogsPath,
    async (): Promise<GetOmniInferLogsPathResponse> => {
      const path = options.runtime.omniInferLogsDir ?? ''
      return { path, exists: !!path && existsSync(path) }
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.omniinfer.pickLocalGguf,
    async (event): Promise<PickLocalGgufResponse> => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const result = senderWindow
        ? await dialog.showOpenDialog(senderWindow, gguDialogOptions())
        : await dialog.showOpenDialog(gguDialogOptions())
      if (result.canceled || result.filePaths.length === 0) {
        return { path: null }
      }
      const picked = result.filePaths[0]
      if (!isAbsolute(picked) || !existsSync(picked)) {
        return { path: null }
      }
      installedModels.registerManualPath(picked)
      await syncOmniInferProviderModels({
        providers: options.runtime.providerManager,
        installedModels,
        logger,
      })
      return { path: picked }
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.omniinfer.pickModelsDir,
    async (event): Promise<PickModelsDirResponse> => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const dialogOptions: Electron.OpenDialogOptions = {
        title: '选择 OmniInfer 模型目录',
        properties: ['openDirectory'],
      }
      const result = senderWindow
        ? await dialog.showOpenDialog(senderWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)
      if (result.canceled || result.filePaths.length === 0) {
        return { path: null }
      }
      const picked = result.filePaths[0]
      if (!isAbsolute(picked) || !existsSync(picked)) {
        return { path: null }
      }
      return { path: picked }
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.omniinfer.pickInstallDir,
    async (event): Promise<PickOmniInferInstallDirResponse> => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const result = senderWindow
        ? await dialog.showOpenDialog(senderWindow, installDirDialogOptions())
        : await dialog.showOpenDialog(installDirDialogOptions())
      if (result.canceled || result.filePaths.length === 0) {
        return { path: null }
      }
      const picked = result.filePaths[0]
      if (!isAbsolute(picked) || !existsSync(picked)) {
        return { path: null }
      }
      return { path: picked }
    }
  )

  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.omniinfer.rescanModels,
    async (): Promise<RescanInstalledModelsResponse> => {
      const models = await installedModels.scan()
      await syncOmniInferProviderModels({
        providers: options.runtime.providerManager,
        installedModels,
        logger,
      })
      return { models, modelsDir: installedModels.getModelsDir() }
    }
  )

  // Status / log push channels
  const broadcastStatus = (snapshot: OmniInferRuntimeSnapshot): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.omniinfer.statusChanged, snapshot)
      }
    }
  }
  service.onChanged(broadcastStatus)

  const broadcastLog = (entry: unknown): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.omniinfer.log, entry)
      }
    }
  }
  options.runtime.omniInferProcessController?.onLog(broadcastLog)

  // Expose installed models list-only channel under same `rescan` (for read-only).
  // We piggy-back on rescanModels return shape for live list; the renderer can simply call
  // the rescan handler initially. Additional dedicated channel would be redundant.
}

function gguDialogOptions(): Electron.OpenDialogOptions {
  return {
    title: '选择本地 GGUF 模型',
    properties: ['openFile'],
    filters: [{ name: 'GGUF 模型', extensions: ['gguf'] }],
  }
}

function installDirDialogOptions(): Electron.OpenDialogOptions {
  return {
    title: '选择 OmniInfer 安装目录',
    properties: ['openDirectory'],
  }
}

function resolveModelRequest(
  request: SelectModelRequest,
  installedModels: {
    resolveModelPath: (modelId: string) => string | undefined
    list: () => InstalledModelRecord[]
  }
): {
  absolutePath: string
  mmprojPath?: string
  contextLength?: number
  launchArgs?: string[]
  requestDefaults?: SelectModelRequest['options'] extends { requestDefaults?: infer T } ? T : never
} {
  const options = request.options
  if ('path' in request) {
    if (!request.path || !isAbsolute(request.path) || !existsSync(request.path)) {
      throw new Error(`OmniInfer model path is not accessible: ${request.path}`)
    }
    return {
      absolutePath: request.path,
      mmprojPath: request.mmproj,
      contextLength: options?.contextLength,
      launchArgs: options?.launchArgs,
      // biome-ignore lint/suspicious/noExplicitAny: pass-through to runtime service
      requestDefaults: options?.requestDefaults as any,
    }
  }

  const absolutePath = installedModels.resolveModelPath(request.modelId)
  if (!absolutePath) {
    throw new Error(`OmniInfer model id not installed: ${request.modelId}`)
  }
  const record = installedModels.list().find((entry) => entry.id === request.modelId)
  return {
    absolutePath,
    mmprojPath: record?.mmprojPath,
    contextLength: options?.contextLength,
    launchArgs: options?.launchArgs,
    // biome-ignore lint/suspicious/noExplicitAny: pass-through to runtime service
    requestDefaults: options?.requestDefaults as any,
  }
}
