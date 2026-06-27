import type { Logger } from '@core/logging'
import { IPC_CHANNELS } from '@shared/constants'
import type {
  CatBounds,
  CatNotificationActionRequest,
  CatNotificationEvent,
} from '@shared/types/cat'
import type { CronRun, CronTask, CronTaskChangedEvent } from '@shared/types/cron'
import { BrowserWindow, ipcMain, screen } from 'electron'

interface CatNotificationControllerOptions {
  logger?: Logger
  getSessionKind: (sessionId: string) => string | undefined
  getAnchorBounds?: () => CatBounds | null
  openCatPanel: (sessionId: string) => void
  autoDismissMs?: number
}

const notificationSize = {
  width: 332,
  height: 142,
}

const notificationMargin = 12
const defaultAutoDismissMs = 8_000
const notificationProtocol = 'omnipaw-cat-notification:'

class CatNotificationController {
  private window: BrowserWindow | null = null
  private activePayload: CatNotificationEvent | null = null

  constructor(private readonly options: CatNotificationControllerOptions) {}

  registerIpcHandlers(): void {
    ipcMain.handle(
      IPC_CHANNELS.catNotification.close,
      (_event, request?: CatNotificationActionRequest | string) => {
        if (this.matchesActionRequest(request)) {
          this.destroy()
        }
      }
    )
    ipcMain.handle(
      IPC_CHANNELS.catNotification.viewResult,
      (_event, request?: CatNotificationActionRequest | string) => {
        const sessionId = this.resolveActionSessionId(request)
        if (!sessionId) {
          return
        }

        this.options.openCatPanel(sessionId)
        this.destroy()
      }
    )
  }

  handleCronChanged(event: CronTaskChangedEvent): void {
    const payload = this.notificationFromCronEvent(event)
    if (!payload) {
      return
    }

    this.show(payload)
  }

  destroy(): void {
    this.activePayload = null
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
    this.window = null
  }

  private notificationFromCronEvent(event: CronTaskChangedEvent): CatNotificationEvent | null {
    if (event.reason !== 'run_completed' && event.reason !== 'run_failed') {
      return null
    }
    if (!event.task || !event.run) {
      return null
    }

    const sessionId = this.resolveCatSessionId(event.task)
    if (!sessionId) {
      return null
    }

    return {
      id: `${event.task.id}:${event.run.id}:${Date.now()}`,
      status: normalizeNotificationStatus(event.run),
      taskId: event.task.id,
      runId: event.run.id,
      resultMessageId: event.run.resultMessageId,
      sessionId,
      title: sanitizeNotificationText(event.task.name, 96, '计划任务'),
      summaryPreview: summarizeRun(event.run),
      createdAt: Date.now(),
    }
  }

  private resolveCatSessionId(task: CronTask): string | null {
    const targetKind = this.options.getSessionKind(task.targetSessionId)
    if (targetKind === 'cat') {
      return task.targetSessionId
    }

    const sourceKind = this.options.getSessionKind(task.sourceSessionId)
    if (sourceKind === 'cat') {
      return task.sourceSessionId
    }

    return null
  }

  private show(payload: CatNotificationEvent): void {
    this.activePayload = payload
    this.broadcast(payload)
    const window = this.ensureWindow()
    window.setBounds(this.resolveBounds())

    void window
      .loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          renderNotificationHtml(payload, this.options.autoDismissMs ?? defaultAutoDismissMs)
        )}`
      )
      .then(() => {
        if (this.window && !this.window.isDestroyed() && this.activePayload?.id === payload.id) {
          this.window.showInactive()
        }
      })
      .catch((error) => {
        this.options.logger?.warn('Cat notification failed to render.', {
          notificationId: payload.id,
          taskId: payload.taskId,
          runId: payload.runId,
          error,
        })
      })
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    this.window = new BrowserWindow({
      ...this.resolveBounds(),
      title: 'OmniPaw Cat Notification',
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    this.window.setAlwaysOnTop(true, 'floating')
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.window.webContents.setWindowOpenHandler(({ url }) => {
      this.handleActionUrl(url)
      return { action: 'deny' }
    })
    this.window.webContents.on('will-navigate', (event, url) => {
      if (this.handleActionUrl(url)) {
        event.preventDefault()
      }
    })
    this.window.webContents.on('render-process-gone', (_event, details) => {
      this.options.logger?.warn('Cat notification renderer ended.', {
        reason: details.reason,
        exitCode: details.exitCode,
      })
    })
    this.window.on('closed', () => {
      this.window = null
      this.activePayload = null
    })

    return this.window
  }

  private broadcast(payload: CatNotificationEvent): void {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.catNotification.event, payload)
    }
  }

  private handleActionUrl(url: string): boolean {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return false
    }

    if (parsed.protocol !== notificationProtocol) {
      return false
    }

    const payload = this.activePayload
    if (!payload || parsed.searchParams.get('id') !== payload.id) {
      return true
    }

    if (parsed.hostname === 'view') {
      this.options.openCatPanel(payload.sessionId)
      this.destroy()
      return true
    }

    if (parsed.hostname === 'close') {
      this.destroy()
      return true
    }

    return true
  }

  private matchesActionRequest(
    request: CatNotificationActionRequest | string | undefined
  ): boolean {
    if (!request) {
      return true
    }

    const notificationId = typeof request === 'string' ? request : request.notificationId
    return !notificationId || notificationId === this.activePayload?.id
  }

  private resolveActionSessionId(
    request: CatNotificationActionRequest | string | undefined
  ): string | null {
    if (!request) {
      return this.activePayload?.sessionId ?? null
    }

    if (typeof request === 'string') {
      return request === this.activePayload?.id ? this.activePayload.sessionId : null
    }

    if (request.notificationId && request.notificationId !== this.activePayload?.id) {
      return null
    }

    return request.sessionId ?? this.activePayload?.sessionId ?? null
  }

  private resolveBounds(): Electron.Rectangle {
    const anchor = this.options.getAnchorBounds?.()
    const display = anchor ? screen.getDisplayMatching(anchor) : screen.getPrimaryDisplay()
    const workArea = display.workArea
    const maxX = workArea.x + workArea.width - notificationSize.width - notificationMargin
    const maxY = workArea.y + workArea.height - notificationSize.height - notificationMargin

    if (!anchor) {
      return {
        ...notificationSize,
        x: maxX,
        y: maxY,
      }
    }

    const preferredX = anchor.x + anchor.width - notificationSize.width + notificationMargin
    const aboveY = anchor.y - notificationSize.height - notificationMargin
    const belowY = anchor.y + anchor.height + notificationMargin
    const preferredY = aboveY >= workArea.y + notificationMargin ? aboveY : belowY

    return {
      ...notificationSize,
      x: clamp(preferredX, workArea.x + notificationMargin, maxX),
      y: clamp(preferredY, workArea.y + notificationMargin, maxY),
    }
  }
}

function normalizeNotificationStatus(run: CronRun): CatNotificationEvent['status'] {
  if (run.status === 'complete') {
    return 'complete'
  }
  if (run.status === 'interrupted') {
    return 'interrupted'
  }
  return 'failed'
}

function summarizeRun(run: CronRun): string {
  if (run.status === 'complete') {
    return sanitizeNotificationText(run.resultSummary, 220, '任务已完成。')
  }

  return sanitizeNotificationText(run.error?.message, 220, '任务执行失败。')
}

function sanitizeNotificationText(value: unknown, maxLength: number, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = redactSensitiveFragments(value)
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) {
    return fallback
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized
}

function redactSensitiveFragments(value: string): string {
  return value
    .replace(/file:\/\/\S+/gi, '[path]')
    .replace(/[A-Za-z]:\\(?:[^\s\\/:*?"<>|]+\\?)+/g, '[path]')
    .replace(/\/(?:Users|home|var|tmp|private|Volumes)\/\S+/g, '[path]')
    .replace(
      /\b(api[_-]?key|token|secret|password)\b\s*[:=]\s*\S+/gi,
      (_match, label: string) => `${label}=[redacted]`
    )
}

function renderNotificationHtml(payload: CatNotificationEvent, autoDismissMs: number): string {
  const title = statusTitle(payload.status)
  const accent = payload.status === 'complete' ? '#16a34a' : '#dc2626'
  const actionLabel = payload.status === 'complete' ? '查看结果' : '查看详情'
  const closeUrl = actionUrl('close', payload.id)
  const viewUrl = actionUrl('view', payload.id)

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent;
        color: #0f172a;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .bubble {
        box-sizing: border-box;
        width: calc(100% - 12px);
        height: calc(100% - 12px);
        margin: 6px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 16px 36px rgba(15, 23, 42, 0.22);
        display: grid;
        grid-template-rows: auto 1fr auto;
        gap: 6px;
        padding: 10px;
      }

      .top {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 8px;
      }

      .dot {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: ${accent};
        flex: 0 0 auto;
      }

      h1 {
        min-width: 0;
        margin: 0;
        flex: 1 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
        line-height: 18px;
        font-weight: 650;
      }

      .close {
        color: #64748b;
        text-decoration: none;
        font-size: 18px;
        line-height: 18px;
        padding: 0 2px;
      }

      .summary {
        min-height: 0;
        margin: 0;
        overflow: hidden;
        color: #334155;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        font-size: 12px;
        line-height: 17px;
      }

      .footer {
        display: flex;
        min-width: 0;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .task {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #64748b;
        font-size: 11px;
        line-height: 16px;
      }

      .view {
        flex: 0 0 auto;
        color: #0f172a;
        border: 1px solid rgba(15, 23, 42, 0.14);
        border-radius: 6px;
        background: #f8fafc;
        padding: 4px 8px;
        text-decoration: none;
        font-size: 12px;
        line-height: 16px;
        font-weight: 560;
      }
    </style>
  </head>
  <body>
    <main class="bubble" aria-label="${escapeHtml(title)}">
      <div class="top">
        <span class="dot" aria-hidden="true"></span>
        <h1>${escapeHtml(title)}</h1>
        <a class="close" href="${escapeAttribute(closeUrl)}" aria-label="关闭">×</a>
      </div>
      <p class="summary">${escapeHtml(payload.summaryPreview)}</p>
      <div class="footer">
        <div class="task">${escapeHtml(payload.title)}</div>
        <a class="view" href="${escapeAttribute(viewUrl)}">${escapeHtml(actionLabel)}</a>
      </div>
    </main>
    <script>
      const closeUrl = ${JSON.stringify(closeUrl)};
      let remaining = ${Math.max(1_000, Math.min(autoDismissMs, 60_000))};
      let startedAt = Date.now();
      let timer = null;
      let paused = false;

      function closeBubble() {
        window.location.href = closeUrl;
      }

      function schedule() {
        window.clearTimeout(timer);
        if (!paused) {
          startedAt = Date.now();
          timer = window.setTimeout(closeBubble, remaining);
        }
      }

      function pause() {
        if (paused) return;
        paused = true;
        remaining = Math.max(400, remaining - (Date.now() - startedAt));
        window.clearTimeout(timer);
      }

      function resume() {
        if (!paused) return;
        paused = false;
        schedule();
      }

      window.addEventListener('mouseenter', pause);
      window.addEventListener('mouseleave', resume);
      window.addEventListener('focus', pause);
      window.addEventListener('blur', resume);
      schedule();
    </script>
  </body>
</html>`
}

function statusTitle(status: CatNotificationEvent['status']): string {
  if (status === 'complete') {
    return '任务完成'
  }
  if (status === 'interrupted') {
    return '任务中断'
  }
  return '任务失败'
}

function actionUrl(action: 'close' | 'view', id: string): string {
  return `${notificationProtocol}//${action}?id=${encodeURIComponent(id)}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function createCatNotificationController(
  options: CatNotificationControllerOptions
): CatNotificationController {
  return new CatNotificationController(options)
}

export type { CatNotificationController }
