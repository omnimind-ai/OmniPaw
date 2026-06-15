import type { OmniInferLogEntry, OmniInferProcessSnapshot } from '@shared/types/omniinfer'

export interface OmniInferProcessStopOptions {
  shutdownTimeoutMs?: number
}

export type OmniInferProcessLogListener = (entry: OmniInferLogEntry) => void
export type OmniInferProcessExitListener = (snapshot: OmniInferProcessSnapshot) => void
export type OmniInferProcessStateListener = (snapshot: OmniInferProcessSnapshot) => void

export interface OmniInferProcessController {
  /** Spawn the OmniInfer binary if not already running. No-op if already running. */
  start(): Promise<OmniInferProcessSnapshot>

  /**
   * Stop the OmniInfer process. Implementations are expected to attempt graceful shutdown
   * (typically through the control plane) before sending signals.
   */
  stop(options?: OmniInferProcessStopOptions): Promise<OmniInferProcessSnapshot>

  /** Latest process snapshot. */
  getState(): OmniInferProcessSnapshot

  /** Update the managed OmniInfer project/install directory. */
  setInstallDir?(installDir: string | undefined): void

  /** Update the models directory passed to the managed OmniInfer process. */
  setModelsDir?(dir: string): void

  /** Update the host/port used when spawning the managed gateway. */
  setEndpoint?(endpoint: { host: string; port: number }): void

  /** Subscribe to log lines emitted by the child process. */
  onLog(listener: OmniInferProcessLogListener): () => void

  /** Subscribe to terminal exit events (clean or crash). */
  onExit(listener: OmniInferProcessExitListener): () => void

  /** Subscribe to every state transition. */
  onStateChanged(listener: OmniInferProcessStateListener): () => void

  /** Absolute path where the controller writes stdio logs (for "View logs" UI). */
  getLogsPath(): string | undefined
}
