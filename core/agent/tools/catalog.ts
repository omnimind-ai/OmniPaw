import { BUILTIN_TOOL_PROMPTS } from '@core/prompts'
import type { ToolProfile, ToolRisk } from './types'

export interface BuiltinToolDefinition {
  name: string
  providerName?: string
  label: string
  description: string
  risk: ToolRisk
  source: 'builtin'
  profiles: ToolProfile[]
  parameters: Record<string, unknown>
}

const ALL_TOOL_PROFILES: ToolProfile[] = ['minimal', 'assistant', 'power']
const LOCAL_TOOL_PROFILES: ToolProfile[] = ['assistant', 'power']

export const TOOL_PROFILE_ALLOWLIST: Record<ToolProfile, string[]> = {
  minimal: [
    'system_time',
    'calculator',
    'attachment_text_read',
    'attachment_text_search',
    'skill_read',
  ],
  assistant: [
    'system_time',
    'calculator',
    'attachment_text_read',
    'attachment_text_search',
    'memory_search',
    'memory_create',
    'memory_update_proposal',
    'memory_forget_proposal',
    'future_task',
    'skill_read',
    'workspace_file',
    'terminal_exec',
    'screen_observe',
  ],
  power: [
    'system_time',
    'calculator',
    'attachment_text_read',
    'attachment_text_search',
    'memory_search',
    'memory_create',
    'memory_update_proposal',
    'memory_forget_proposal',
    'future_task',
    'skill_read',
    'workspace_file',
    'terminal_exec',
    'screen_observe',
  ],
}

export const DEFAULT_TOOL_APPROVAL_RISKS: Record<ToolProfile, ToolRisk[]> = {
  minimal: ['write', 'network', 'exec'],
  assistant: ['write', 'network', 'exec'],
  power: [],
}

export const BUILTIN_TOOL_ORDER = [
  'system_time',
  'calculator',
  'attachment_text_read',
  'attachment_text_search',
  'memory_search',
  'memory_create',
  'memory_update_proposal',
  'memory_forget_proposal',
  'future_task',
  'screen_observe',
  'workspace_file',
  'terminal_exec',
  'skill_read',
] as const

export const BUILTIN_TOOL_CATALOG = {
  system_time: {
    name: 'system_time',
    label: BUILTIN_TOOL_PROMPTS.systemTime.label,
    description: BUILTIN_TOOL_PROMPTS.systemTime.description,
    risk: 'safe',
    source: 'builtin',
    profiles: ALL_TOOL_PROFILES,
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  calculator: {
    name: 'calculator',
    label: BUILTIN_TOOL_PROMPTS.calculator.label,
    description: BUILTIN_TOOL_PROMPTS.calculator.description,
    risk: 'safe',
    source: 'builtin',
    profiles: ALL_TOOL_PROFILES,
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: BUILTIN_TOOL_PROMPTS.calculator.expressionDescription,
        },
        operation: {
          type: 'string',
          enum: ['add', 'subtract', 'multiply', 'divide', 'power'],
        },
        operands: {
          type: 'array',
          items: { type: 'number' },
        },
      },
      additionalProperties: false,
    },
  },
  attachment_text_read: {
    name: 'attachment_text_read',
    label: BUILTIN_TOOL_PROMPTS.attachmentTextRead.label,
    description: BUILTIN_TOOL_PROMPTS.attachmentTextRead.description,
    risk: 'read',
    source: 'builtin',
    profiles: ALL_TOOL_PROFILES,
    parameters: {
      type: 'object',
      properties: {
        attachmentId: { type: 'string' },
        attachmentIds: { type: 'array', items: { type: 'string' } },
        maxChars: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  attachment_text_search: {
    name: 'attachment_text_search',
    label: BUILTIN_TOOL_PROMPTS.attachmentTextSearch.label,
    description: BUILTIN_TOOL_PROMPTS.attachmentTextSearch.description,
    risk: 'read',
    source: 'builtin',
    profiles: ALL_TOOL_PROFILES,
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string' },
        maxResults: { type: 'number' },
        contextChars: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  memory_search: {
    name: 'memory_search',
    label: BUILTIN_TOOL_PROMPTS.memorySearch.label,
    description: BUILTIN_TOOL_PROMPTS.memorySearch.description,
    risk: 'read',
    source: 'builtin',
    profiles: LOCAL_TOOL_PROFILES,
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['search', 'overview'],
          description: BUILTIN_TOOL_PROMPTS.memorySearch.modeDescription,
        },
        query: {
          type: 'string',
          description: BUILTIN_TOOL_PROMPTS.memorySearch.queryDescription,
        },
        limit: { type: 'number' },
        kinds: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['profile', 'preference', 'relationship', 'episode', 'plan', 'boundary', 'fact'],
          },
        },
        scopes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['global', 'user', 'companion', 'session', 'character'],
          },
        },
        minConfidence: { type: 'number' },
        sessionOnly: {
          type: 'boolean',
          description: BUILTIN_TOOL_PROMPTS.memorySearch.sessionOnlyDescription,
        },
      },
      additionalProperties: false,
    },
  },
  memory_create: {
    name: 'memory_create',
    label: BUILTIN_TOOL_PROMPTS.memoryCreate.label,
    description: BUILTIN_TOOL_PROMPTS.memoryCreate.description,
    risk: 'write',
    source: 'builtin',
    profiles: LOCAL_TOOL_PROFILES,
    parameters: {
      type: 'object',
      required: ['content'],
      properties: {
        content: {
          type: 'string',
          description: BUILTIN_TOOL_PROMPTS.memoryCreate.contentDescription,
        },
        kind: {
          type: 'string',
          enum: ['profile', 'preference', 'relationship', 'episode', 'plan', 'boundary', 'fact'],
        },
        scope: {
          type: 'string',
          enum: ['global', 'user', 'companion', 'session', 'character'],
        },
        subject: { type: 'string' },
        importance: { type: 'number' },
        confidence: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  memory_update_proposal: {
    name: 'memory_update_proposal',
    label: BUILTIN_TOOL_PROMPTS.memoryUpdateProposal.label,
    description: BUILTIN_TOOL_PROMPTS.memoryUpdateProposal.description,
    risk: 'write',
    source: 'builtin',
    profiles: LOCAL_TOOL_PROFILES,
    parameters: {
      type: 'object',
      required: ['memoryId', 'reason'],
      properties: {
        memoryId: { type: 'string' },
        relatedMemoryId: { type: 'string' },
        kind: {
          type: 'string',
          enum: ['update', 'merge', 'archive', 'review'],
        },
        proposedContent: { type: 'string' },
        reason: { type: 'string' },
        confidence: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  memory_forget_proposal: {
    name: 'memory_forget_proposal',
    label: BUILTIN_TOOL_PROMPTS.memoryForgetProposal.label,
    description: BUILTIN_TOOL_PROMPTS.memoryForgetProposal.description,
    risk: 'write',
    source: 'builtin',
    profiles: LOCAL_TOOL_PROFILES,
    parameters: {
      type: 'object',
      required: ['memoryId', 'reason'],
      properties: {
        memoryId: { type: 'string' },
        action: {
          type: 'string',
          enum: ['archive', 'delete'],
        },
        reason: { type: 'string' },
        confidence: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  skill_read: {
    name: 'skill_read',
    label: BUILTIN_TOOL_PROMPTS.skillRead.label,
    description: BUILTIN_TOOL_PROMPTS.skillRead.description,
    risk: 'read',
    source: 'builtin',
    profiles: ALL_TOOL_PROFILES,
    parameters: {
      type: 'object',
      required: ['skillId'],
      properties: {
        skillId: {
          type: 'string',
          description: BUILTIN_TOOL_PROMPTS.skillRead.skillIdDescription,
        },
      },
      additionalProperties: false,
    },
  },
  future_task: {
    name: 'future_task',
    label: BUILTIN_TOOL_PROMPTS.futureTask.label,
    description: BUILTIN_TOOL_PROMPTS.futureTask.description,
    risk: 'write',
    source: 'builtin',
    profiles: LOCAL_TOOL_PROFILES,
    parameters: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'edit', 'delete', 'list'],
        },
        taskId: { type: 'string' },
        name: { type: 'string' },
        note: { type: 'string' },
        runAt: {
          anyOf: [{ type: 'number' }, { type: 'string' }],
          description: BUILTIN_TOOL_PROMPTS.futureTask.runAtDescription,
        },
        cronExpression: {
          type: 'string',
          description: BUILTIN_TOOL_PROMPTS.futureTask.cronExpressionDescription,
        },
        enabled: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  screen_observe: {
    name: 'screen_observe',
    label: BUILTIN_TOOL_PROMPTS.screenObserve.label,
    description: BUILTIN_TOOL_PROMPTS.screenObserve.description,
    risk: 'read',
    source: 'builtin',
    profiles: LOCAL_TOOL_PROFILES,
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: BUILTIN_TOOL_PROMPTS.screenObserve.reasonDescription,
        },
      },
      additionalProperties: false,
    },
  },
  workspace_file: {
    name: 'workspace_file',
    label: BUILTIN_TOOL_PROMPTS.workspaceFile.label,
    description: BUILTIN_TOOL_PROMPTS.workspaceFile.description,
    risk: 'read',
    source: 'builtin',
    profiles: LOCAL_TOOL_PROFILES,
    parameters: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'read', 'write', 'search', 'patch'],
        },
        path: {
          type: 'string',
          description: BUILTIN_TOOL_PROMPTS.workspaceFile.pathDescription,
        },
        recursive: { type: 'boolean' },
        maxEntries: { type: 'number' },
        maxBytes: { type: 'number' },
        content: { type: 'string' },
        append: { type: 'boolean' },
        query: { type: 'string' },
        maxResults: { type: 'number' },
        contextChars: { type: 'number' },
        oldText: { type: 'string' },
        newText: { type: 'string' },
        replaceAll: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  terminal_exec: {
    name: 'terminal_exec',
    label: BUILTIN_TOOL_PROMPTS.terminalExec.label,
    description: BUILTIN_TOOL_PROMPTS.terminalExec.description,
    risk: 'exec',
    source: 'builtin',
    profiles: LOCAL_TOOL_PROFILES,
    parameters: {
      type: 'object',
      required: ['command'],
      properties: {
        command: {
          type: 'string',
          description: BUILTIN_TOOL_PROMPTS.terminalExec.commandDescription,
        },
        cwd: {
          type: 'string',
          description: BUILTIN_TOOL_PROMPTS.terminalExec.cwdDescription,
        },
        timeoutMs: { type: 'number' },
        maxOutputChars: { type: 'number' },
        background: { type: 'boolean' },
        pty: { type: 'boolean' },
        env: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
        network: {
          type: 'string',
          enum: ['ask', 'allow', 'deny'],
        },
      },
      additionalProperties: false,
    },
  },
} satisfies Record<string, BuiltinToolDefinition>
