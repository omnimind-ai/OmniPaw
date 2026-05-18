import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SkillLoader } from '../core/skill/loader'
import { SkillManager } from '../core/skill/skill-manager'
import { normalizeSkillState, SkillStateStore } from '../core/skill'

const tempDir = mkdtempSync(join(tmpdir(), 'openomniclaw-skill-smoke-'))

try {
  const store = new SkillStateStore({ userDataPath: tempDir })
  const firstLoad = store.load()
  assert.equal(firstLoad.version, 1)
  assert.deepEqual(firstLoad.enabledById, {})
  assert.equal(existsSync(store.statePath), true)
  assert.equal(store.statePath.endsWith('skill_state.json'), true)

  const normalized = normalizeSkillState({
    version: 1,
    enabledById: {
      ' Example Skill ': false,
    },
  }).state
  assert.equal(normalized.enabledById.example_skill, false)

  const skillRoot = join(tempDir, 'skills')
  mkdirSync(join(skillRoot, 'writer'), { recursive: true })
  writeFileSync(join(skillRoot, 'writer', 'SKILL.md'), [
    '---',
    'name: Writer',
    'description: Draft concise text',
    'license: MIT',
    'compatibility: local',
    '---',
    '',
    'Use short sentences.',
  ].join('\n'), 'utf8')
  mkdirSync(join(skillRoot, 'empty'), { recursive: true })
  mkdirSync(join(skillRoot, 'large'), { recursive: true })
  writeFileSync(join(skillRoot, 'large', 'SKILL.md'), 'x'.repeat(300_000), 'utf8')

  const loader = new SkillLoader()
  const loaded = loader.loadFromRoots([{ name: 'local', path: skillRoot }])
  assert.equal(loaded.some((skill) => skill.id === 'writer' && skill.status === 'available'), true)
  assert.equal(loaded.some((skill) => skill.id === 'empty'), false)
  assert.equal(loaded.some((skill) => skill.id === 'large' && skill.status === 'invalid'), true)

  const manager = new SkillManager({ userDataPath: tempDir })
  const listed = manager.load()
  assert.equal(listed.skills.some((skill) => skill.id === 'writer' && skill.enabled), true)
  assert.equal(listed.skills.some((skill) => skill.id === 'large' && skill.status === 'invalid'), true)

  const prompt = manager.buildPromptInventory({ compact: true, supportsSystemRole: true })
  assert.equal(prompt.injected, true)
  assert.deepEqual(prompt.enabledSkillIds, ['writer'])
  assert.match(prompt.content ?? '', /skill_read/)
  assert.match(prompt.content ?? '', /writer/)

  const read = manager.readEnabledSkillContent('writer')
  assert.equal(read.skillId, 'writer')
  assert.match(read.content, /Use short sentences/)
  assert.deepEqual(manager.drainReadSkillIds(), ['writer'])

  manager.setEnabled({ skillId: 'writer', enabled: false })
  assert.equal(manager.getActiveSkills().some((skill) => skill.id === 'writer'), false)
  assert.equal(manager.buildPromptInventory({ compact: true, supportsSystemRole: true }).omittedReason, 'no_enabled_skills')
  assert.throws(() => manager.readEnabledSkillContent('writer'), /disabled/i)

  store.save({
    version: 1,
    enabledById: {
      missing_skill: false,
      writer: true,
    },
  })
  const reloaded = new SkillManager({ userDataPath: tempDir }).load()
  assert.equal(reloaded.skills.some((skill) => skill.id === 'missing_skill'), false)
  assert.equal(reloaded.skills.find((skill) => skill.id === 'writer')?.enabled, true)

  console.log('Skill management smoke check passed')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
