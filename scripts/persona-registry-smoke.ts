import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PersonaManager } from '../core/persona/manager'
import { PersonaRegistryValidationError } from '../core/persona/registry-schema'
import { PersonaRegistryStore, resolvePersonaRegistryPath } from '../core/persona/registry-store'

const tempDir = mkdtempSync(join(tmpdir(), 'openomniclaw-persona-registry-smoke-'))

try {
  // 1. First load creates an empty registry on disk.
  const store = new PersonaRegistryStore({ appDataPath: tempDir, appName: 'TestApp' })
  const initial = store.load()
  assert.equal(initial.version, 1)
  assert.equal(initial.profiles.length, 0)
  assert.equal(initial.defaultPersonaId, undefined)
  const registryPath = resolvePersonaRegistryPath(tempDir, 'TestApp')
  assert.equal(existsSync(registryPath), true)

  const manager = new PersonaManager({
    registryStore: store,
  })

  // 2. CRUD - create a persona.
  const created = manager.create({
    profile: {
      name: 'Friendly assistant',
      description: 'A warm and helpful tone.',
      prompt: 'You are a warm and helpful assistant.',
    },
  })
  assert.equal(created.ok, true)
  assert.ok(created.profile)
  assert.equal(created.registry.profiles.length, 1)

  // 3. Update changes profile content and keeps createdAt.
  const personaId = created.profile?.id ?? ''
  const updated = manager.update({
    id: personaId,
    profile: {
      name: 'Friendly assistant',
      description: 'Calm and helpful.',
      prompt: 'You are a calm and helpful assistant.',
    },
  })
  assert.equal(updated.profile?.prompt, 'You are a calm and helpful assistant.')
  assert.equal(updated.profile?.createdAt, created.profile?.createdAt)

  // 4. Active persona selection.
  const defaultSet = manager.setDefault({ id: personaId })
  assert.equal(defaultSet.registry.defaultPersonaId, personaId)
  assert.equal(manager.getActiveProfile()?.id, personaId)

  // 5. Validation failure on empty name.
  assert.throws(
    () =>
      manager.create({
        profile: { name: '', prompt: 'irrelevant' },
      }),
    PersonaRegistryValidationError
  )

  // 6. Reload from disk.
  const reloadStore = new PersonaRegistryStore({ appDataPath: tempDir, appName: 'TestApp' })
  const reloaded = reloadStore.load()
  assert.equal(reloaded.profiles.length, 1)
  assert.equal(reloaded.profiles[0]?.id, personaId)
  assert.equal(reloaded.defaultPersonaId, personaId)

  // Legacy enabled flags are ignored and stripped from the normalized registry.
  writeFileSync(
    registryPath,
    JSON.stringify(
      {
        ...reloaded,
        profiles: reloaded.profiles.map((profile) => ({ ...profile, enabled: false })),
      },
      null,
      2
    ),
    'utf8'
  )
  const legacyStore = new PersonaRegistryStore({ appDataPath: tempDir, appName: 'TestApp' })
  const legacyReloaded = legacyStore.load()
  assert.equal('enabled' in (legacyReloaded.profiles[0] as Record<string, unknown>), false)
  const legacyManager = new PersonaManager({ registryStore: legacyStore })
  assert.equal(legacyManager.getActiveProfile()?.id, personaId)

  // 7. Recovery from invalid JSON keeps file untouched.
  writeFileSync(registryPath, '{not-json', 'utf8')
  const brokenStore = new PersonaRegistryStore({ appDataPath: tempDir, appName: 'TestApp' })
  assert.throws(() => brokenStore.load(), PersonaRegistryValidationError)
  const raw = readFileSync(registryPath, 'utf8')
  assert.equal(raw.includes('{not-json'), true)

  // 8. Delete clears default reference.
  // Restore good registry by saving via prior store.
  store.save(reloaded)
  manager.delete({ id: personaId })
  const afterDelete = manager.list()
  assert.equal(afterDelete.registry.profiles.length, 0)
  assert.equal(afterDelete.registry.defaultPersonaId, undefined)

  console.log('persona-registry smoke ok')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
