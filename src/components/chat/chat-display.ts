import type { Component } from 'vue'

import { FileIcon, ImageIcon, MicIcon, VideoIcon } from 'lucide-vue-next'

import type { ChatContent, ChatRecord, MessagePart, ToolCall } from '@/composables/useMessages'

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
  return parts.map(partText).filter(Boolean).join('\n\n')
}

export function partText(part: MessagePart) {
  if (part.type === 'plain') return String(part.text || '')
  if (part.type === 'think') return String(part.think || '')
  if (part.type === 'reply') return replyPreview(part)
  if (part.type === 'tool_call') return toolCalls(part).map(toolCallLabel).join('\n')
  if (isAttachmentPart(part)) return attachmentLabel(part)
  if (part.type === 'ref')
    return refsFromPart(part)
      .map((ref) => ref.title || ref.url || ref.id)
      .join('\n')
  return ''
}

export function isAttachmentPart(part: MessagePart) {
  return ['image', 'record', 'video', 'file'].includes(part.type)
}

export function attachmentIcon(part: MessagePart): Component {
  if (part.type === 'image') return ImageIcon
  if (part.type === 'record') return MicIcon
  if (part.type === 'video') return VideoIcon
  return FileIcon
}

export function attachmentLabel(part: MessagePart) {
  if (part.filename) return part.filename
  const embeddedFile = part.embedded_file
  if (embeddedFile?.filename) return embeddedFile.filename
  if (part.type === 'image') return '图片'
  if (part.type === 'record') return '音频'
  if (part.type === 'video') return '视频'
  return '附件'
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

export function toolCallLabel(toolCall: ToolCall) {
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
