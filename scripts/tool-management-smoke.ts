import assert from 'node:assert/strict'

import { ToolManagementService } from '../core/agent/tools/management-service'
import { providerToolsFromAgentTools, ToolRegistry } from '../core/agent/tools/registry'

class MemorySettingsRepo {
  private readonly values = new Map<string, unknown>()

  getJson<T>(key: string, fallback: T): T {
    return this.values.has(key) ? (this.values.get(key) as T) : fallback
  }

  setJson(key: string, value: unknown): void {
    this.values.set(key, value)
  }
}

const settings = new MemorySettingsRepo()

try {
  const service = new ToolManagementService(settings)

  const initialTools = service.list()
  assert.ok(initialTools.length >= 5)
  assert.equal(
    initialTools.some((tool) => tool.name === 'future_task' && tool.risk === 'write'),
    true
  )
  assert.ok(initialTools.every((tool) => tool.enabled))
  assert.ok(initialTools.every((tool) => tool.source === 'builtin'))

  const disabled = service.setEnabled('calculator', false)
  assert.equal(disabled.tool.enabled, false)
  assert.equal(service.list().find((tool) => tool.name === 'calculator')?.enabled, false)
  assert.deepEqual([...service.getDisabledToolNames()], ['calculator'])

  const enabled = service.setEnabled('calculator', true)
  assert.equal(enabled.tool.enabled, true)
  assert.deepEqual([...service.getDisabledToolNames()], [])

  settings.setJson('agent.disabledTools', ['calculator', 'stale_tool'])
  const withStaleName = service.list()
  assert.equal(withStaleName.find((tool) => tool.name === 'calculator')?.enabled, false)
  assert.equal(
    withStaleName.some((tool) => tool.name === 'stale_tool'),
    false
  )
  assert.deepEqual([...service.getDisabledToolNames()], ['calculator'])

  assert.throws(() => service.setEnabled('missing_tool', false), /not registered/)

  const registry = new ToolRegistry({
    messages: {
      listBySession: () => [],
      listAttachmentLinks: () => [],
    },
    attachments: {
      get: () => undefined,
    },
    disabledToolNames: () => service.getDisabledToolNames(),
  })
  const resolved = await registry.resolve({
    sessionId: 'missing-session',
    policy: {
      enabled: true,
      profile: 'minimal',
      requireApprovalForRisk: ['write', 'network', 'exec'],
    },
  })

  assert.equal(
    resolved.some((tool) => tool.name === 'calculator'),
    false
  )
  assert.equal(
    providerToolsFromAgentTools(resolved).some((tool) => tool.function.name === 'calculator'),
    false
  )

  console.log('Tool management smoke check passed')
} finally {
  // No external resources.
}
