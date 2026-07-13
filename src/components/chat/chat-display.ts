import { CameraIcon, FileIcon, ImageIcon, MicIcon, VideoIcon } from '@lucide/vue'
import type { Component } from 'vue'

import type { ChatContent, ChatRecord, MessagePart, ToolCall } from '@/composables/useMessages'

type ToolCallTranslate = (key: string, named?: Record<string, unknown>) => string

export function recordId(record: ChatRecord) {
  return record.id == null ? '' : String(record.id)
}

export function recordStatus(record: ChatRecord) {
  return String(record.status || '').toLowerCase()
}

export function isRecordAborted(record: ChatRecord) {
  return recordStatus(record) === 'aborted'
}

export function isRecordErrored(record: ChatRecord) {
  return recordStatus(record) === 'error'
}

export function recordErrorText(record: ChatRecord) {
  const value = record.error
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const payload = value as Record<string, unknown>
  if (typeof payload.message === 'string') return payload.message
  if (typeof payload.error === 'string') return payload.error
  if (typeof payload.reason === 'string') return payload.reason
  return ''
}

export function contentText(content: ChatContent) {
  const parts = Array.isArray(content.message) ? content.message : []
  return parts.map(partBodyText).filter(Boolean).join('\n\n')
}

export function partText(part: MessagePart) {
  if (part.type === 'plain') return String(part.text || '')
  if (part.type === 'think') return String(part.think || '')
  if (part.type === 'reply') return replyPreview(part)
  if (part.type === 'tool_call') return toolCalls(part).map(toolCallLabel).join('\n')
  if (part.type === 'vision_capture') return visionCaptureLabel(part)
  if (isAttachmentPart(part)) return attachmentLabel(part)
  if (part.type === 'ref')
    return refsFromPart(part)
      .map((ref) => ref.title || ref.url || ref.id)
      .join('\n')
  return ''
}

function partBodyText(part: MessagePart) {
  if (part.type === 'plain' || part.type === 'text') return String(part.text || '')
  return ''
}

export function isAttachmentPart(part: MessagePart) {
  return ['image', 'record', 'video', 'file', 'vision_capture'].includes(part.type)
}

export function attachmentIcon(part: MessagePart): Component {
  if (part.type === 'vision_capture') return CameraIcon
  if (part.type === 'image') return ImageIcon
  if (part.type === 'record') return MicIcon
  if (part.type === 'video') return VideoIcon
  return FileIcon
}

export function attachmentLabel(part: MessagePart) {
  if (part.filename) return part.filename
  if (part.type === 'vision_capture') return visionCaptureLabel(part)
  const embeddedFile = part.embedded_file
  if (embeddedFile?.filename) return embeddedFile.filename
  if (part.type === 'image') return '图片'
  if (part.type === 'record') return '音频'
  if (part.type === 'video') return '视频'
  return '附件'
}

export function visionCaptureLabel(part: MessagePart) {
  const retained = part.retention === 'persist'
  const dimensions =
    typeof part.width === 'number' && typeof part.height === 'number'
      ? ` ${part.width}x${part.height}`
      : ''
  return retained ? `已保留截图${dimensions}` : `临时截图 marker${dimensions}`
}

export function partUrl(part: MessagePart) {
  if (typeof part.embedded_url === 'string') return part.embedded_url
  if (typeof part.embedded_file?.url === 'string') return part.embedded_file.url
  return ''
}

export function replyMessageId(part: MessagePart) {
  const messageId = part.messageId ?? part.message_id
  return messageId == null ? '' : String(messageId)
}

export function replyPreview(part: MessagePart) {
  const selectedText = String(part.selectedText ?? part.selected_text ?? '').trim()
  if (selectedText) return selectedText
  const messageId = replyMessageId(part)
  return messageId ? `引用消息 ${messageId}` : '引用消息'
}

export interface RefItem {
  id: string
  title?: string
  url?: string
  snippet?: string
}

export function refsFromPart(part: MessagePart): RefItem[] {
  const refs = part.refs
  if (!Array.isArray(refs)) return []
  return refs
    .filter((ref): ref is Record<string, unknown> => Boolean(ref && typeof ref === 'object'))
    .map((ref, index) => ({
      id: String(ref.id || ref.url || `ref-${index}`),
      title: typeof ref.title === 'string' ? ref.title : undefined,
      url: typeof ref.url === 'string' ? ref.url : undefined,
      snippet: typeof ref.snippet === 'string' ? ref.snippet : undefined,
    }))
}

export function toolCalls(part: MessagePart): ToolCall[] {
  const calls = part.tool_calls || part.toolCalls || []
  return Array.isArray(calls) ? calls : []
}

export function toolCallLabel(toolCall: ToolCall, t?: ToolCallTranslate) {
  const summary = builtinToolCallSummary(toolCall, t)
  if (summary) return summary
  return toolCall.name || toolCall.toolName || toolCall.tool_name || toolCall.id || '工具调用'
}

export function toolCallStatus(toolCall: ToolCall) {
  return String(
    toolCall.status || toolCall.state || toolCall.toolStatus || toolCall.tool_status || 'running'
  ).toLowerCase()
}

export function formatJson(value: unknown) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function formatTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function builtinToolCallSummary(toolCall: ToolCall, t?: ToolCallTranslate): string {
  const name = toolName(toolCall)
  const args = payloadRecord(toolCall.args ?? toolCall.arguments)
  const result = payloadRecord(toolCall.result)

  switch (name) {
    case 'system_time':
      return summary(t, 'systemTime', '查看了系统时间')
    case 'calculator':
      return summary(t, 'calculator', '完成了计算')
    case 'attachment_text_read':
      return countedSummary(t, {
        count: attachmentCount(args),
        countedKey: 'attachmentRead',
        pendingKey: 'attachmentReadPending',
        countedFallback: '查看了 {count} 个附件',
        pendingFallback: '查看附件',
      })
    case 'attachment_text_search':
      return countedSummary(t, {
        count: resultCount(result, ['matchCount'], ['matches']),
        countedKey: 'attachmentSearch',
        pendingKey: 'attachmentSearchPending',
        countedFallback: '搜索了 {count} 处附件文本',
        pendingFallback: '搜索附件文本',
      })
    case 'memory_search':
      return countedSummary(t, {
        count: resultCount(result, ['resultCount'], ['results']),
        countedKey: 'memorySearch',
        pendingKey: 'memorySearchPending',
        countedFallback: '查看了 {count} 条记忆',
        pendingFallback: '查看记忆',
      })
    case 'memory_create':
      return countedSummary(t, {
        count: result ? 1 : undefined,
        countedKey: 'memoryCreate',
        pendingKey: 'memoryCreatePending',
        countedFallback: '记录了 {count} 条记忆',
        pendingFallback: '记录记忆',
      })
    case 'memory_update_proposal':
      return countedSummary(t, {
        count: result ? 1 : undefined,
        countedKey: 'memoryUpdate',
        pendingKey: 'memoryUpdatePending',
        countedFallback: '提出了 {count} 条记忆更新',
        pendingFallback: '提出记忆更新',
      })
    case 'memory_forget_proposal':
      return countedSummary(t, {
        count: result ? 1 : undefined,
        countedKey: result?.action === 'archive' ? 'memoryArchive' : 'memoryForget',
        pendingKey: 'memoryForgetPending',
        countedFallback:
          result?.action === 'archive' ? '归档了 {count} 条记忆' : '提出遗忘 {count} 条记忆',
        pendingFallback: '处理记忆遗忘',
      })
    case 'skill_read':
      return summary(t, 'skillRead', '查看了技能')
    case 'future_task':
      return futureTaskSummary(args, result, t)
    case 'screen_observe':
      return summary(t, 'screenObserve', '观察了屏幕')
    case 'workspace_file':
      return workspaceFileSummary(args, result, t)
    case 'terminal_exec':
      return summary(t, 'terminalExec', '运行了命令')
    default:
      return ''
  }
}

function workspaceFileSummary(
  args: Record<string, unknown> | undefined,
  result: Record<string, unknown> | undefined,
  t?: ToolCallTranslate
): string {
  const action = stringValue(result?.action) || stringValue(args?.action)
  if (action === 'write' || action === 'patch') {
    return countedSummary(t, {
      count: result ? 1 : undefined,
      countedKey: 'workspaceWrite',
      pendingKey: 'workspaceWritePending',
      countedFallback: '编辑了 {count} 个文件',
      pendingFallback: '编辑文件',
    })
  }
  if (action === 'read') {
    return countedSummary(t, {
      count: result ? 1 : undefined,
      countedKey: 'workspaceRead',
      pendingKey: 'workspaceReadPending',
      countedFallback: '查看了 {count} 个文件',
      pendingFallback: '查看文件',
    })
  }
  if (action === 'search') {
    return countedSummary(t, {
      count: resultCount(result, ['matchCount'], ['matches']),
      countedKey: 'workspaceSearch',
      pendingKey: 'workspaceSearchPending',
      countedFallback: '搜索了 {count} 处文件内容',
      pendingFallback: '搜索文件',
    })
  }
  return countedSummary(t, {
    count: resultCount(result, [], ['entries']),
    countedKey: 'workspaceList',
    pendingKey: 'workspaceListPending',
    countedFallback: '查看了 {count} 个文件',
    pendingFallback: '查看文件列表',
  })
}

function futureTaskSummary(
  args: Record<string, unknown> | undefined,
  result: Record<string, unknown> | undefined,
  t?: ToolCallTranslate
): string {
  const action = stringValue(result?.action) || stringValue(args?.action)
  if (action === 'create') return summary(t, 'futureTaskCreate', '创建了计划任务')
  if (action === 'edit') return summary(t, 'futureTaskEdit', '编辑了计划任务')
  if (action === 'delete') return summary(t, 'futureTaskDelete', '删除了计划任务')
  return countedSummary(t, {
    count: resultCount(result, ['taskCount'], ['tasks']),
    countedKey: 'futureTaskList',
    pendingKey: 'futureTaskListPending',
    countedFallback: '查看了 {count} 个计划任务',
    pendingFallback: '查看计划任务',
  })
}

function countedSummary(
  t: ToolCallTranslate | undefined,
  input: {
    count: number | undefined
    countedKey: string
    pendingKey: string
    countedFallback: string
    pendingFallback: string
  }
): string {
  if (input.count !== undefined) {
    return summary(t, input.countedKey, input.countedFallback, { count: input.count })
  }
  return summary(t, input.pendingKey, input.pendingFallback)
}

function summary(
  t: ToolCallTranslate | undefined,
  key: string,
  fallback: string,
  values: Record<string, unknown> = {}
): string {
  const fullKey = `chat.toolCall.summary.${key}`
  const translated = t?.(fullKey, values)
  if (translated && translated !== fullKey) {
    return translated
  }
  return interpolate(fallback, values)
}

function toolName(toolCall: ToolCall): string {
  return String(toolCall.name || toolCall.toolName || toolCall.tool_name || '')
}

function payloadRecord(value: unknown): Record<string, unknown> | undefined {
  const parsed = parsePayload(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined
  }
  return parsed as Record<string, unknown>
}

function parsePayload(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function resultCount(
  payload: Record<string, unknown> | undefined,
  numberKeys: string[],
  arrayKeys: string[]
): number | undefined {
  if (!payload) return undefined
  for (const key of numberKeys) {
    const count = finiteCount(payload[key])
    if (count !== undefined) return count
  }
  for (const key of arrayKeys) {
    const value = payload[key]
    if (Array.isArray(value)) return value.length
  }
  return undefined
}

function attachmentCount(args: Record<string, unknown> | undefined): number | undefined {
  if (!args) return undefined
  const ids = new Set<string>()
  const attachmentId = stringValue(args.attachmentId)
  if (attachmentId) ids.add(attachmentId)
  if (Array.isArray(args.attachmentIds)) {
    for (const item of args.attachmentIds) {
      const id = stringValue(item)
      if (id) ids.add(id)
    }
  }
  return ids.size || undefined
}

function finiteCount(value: unknown): number | undefined {
  const count = Number(value)
  if (!Number.isFinite(count) || count < 0) return undefined
  return Math.floor(count)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function interpolate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))
}
