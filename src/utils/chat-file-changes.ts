import { toolCallStatus, toolCalls } from '@/components/chat/chat-display'
import type { ChatRecord, MessagePart, ToolCall } from '@/composables/useMessages'

export type WorkspaceFileAction = 'write' | 'patch'

export interface WorkspaceFileChange {
  path: string
  action: WorkspaceFileAction
  sizeBytes?: number
  updatedAt?: number
  toolCallId: string
}

export function extractWorkspaceFileChanges(record: ChatRecord): WorkspaceFileChange[] {
  const parts = Array.isArray(record.content?.message) ? record.content.message : []
  const byPath = new Map<string, WorkspaceFileChange>()
  for (const part of parts) {
    if (!isToolCallPart(part)) continue
    for (const call of toolCalls(part)) {
      const change = changeFromToolCall(call)
      if (!change) continue
      byPath.set(change.path, change)
    }
  }
  return [...byPath.values()]
}

function isToolCallPart(part: MessagePart): boolean {
  return part?.type === 'tool_call'
}

function changeFromToolCall(call: ToolCall): WorkspaceFileChange | null {
  const name = call.name || call.toolName || call.tool_name
  if (name !== 'workspace_file') return null
  if (toolCallStatus(call) !== 'complete') return null

  const result = call.result
  if (!result || typeof result !== 'object') return null
  const payload = result as Record<string, unknown>
  if (payload.ok === false) return null

  const action = payload.action
  if (action !== 'write' && action !== 'patch') return null

  const entry = payload.entry
  if (!entry || typeof entry !== 'object') return null
  const entryRecord = entry as Record<string, unknown>
  const path = typeof entryRecord.path === 'string' ? entryRecord.path : ''
  if (!path) return null

  return {
    path,
    action,
    sizeBytes: typeof entryRecord.sizeBytes === 'number' ? entryRecord.sizeBytes : undefined,
    updatedAt: typeof entryRecord.updatedAt === 'number' ? entryRecord.updatedAt : undefined,
    toolCallId: String(call.id ?? call.toolCallId ?? call.tool_call_id ?? call.index ?? ''),
  }
}
