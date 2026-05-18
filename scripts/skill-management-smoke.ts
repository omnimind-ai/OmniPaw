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

  const markdownImport = manager.importSkill({
    fileName: 'imported-writer.md',
    bytes: Buffer.from([
      '---',
      'name: Imported Writer',
      'description: Imported from a markdown file',
      '---',
      '',
      'Prefer active voice.',
    ].join('\n')),
  })
  assert.equal(markdownImport.imported.length, 1)
  assert.equal(markdownImport.imported[0]?.id, 'imported-writer')
  assert.equal(markdownImport.imported[0]?.enabled, true)
  assert.equal(existsSync(join(skillRoot, 'imported-writer', 'SKILL.md')), true)

  const rootZipImport = manager.importSkill({
    fileName: 'root-package.zip',
    bytes: createStoredZip({
      'skill.md': [
        '---',
        'name: Root Zip',
        'description: Imported from a root zip package',
        '---',
        '',
        'Use root package instructions.',
      ].join('\n'),
      'references/example.txt': 'extra file',
    }),
  })
  assert.equal(rootZipImport.imported.length, 1)
  assert.equal(rootZipImport.imported[0]?.id, 'root-package')
  assert.equal(existsSync(join(skillRoot, 'root-package', 'SKILL.md')), true)
  assert.equal(existsSync(join(skillRoot, 'root-package', 'references', 'example.txt')), true)

  const multiZipImport = manager.importSkill({
    fileName: 'multi-package.zip',
    bytes: createStoredZip({
      'first-skill/SKILL.md': [
        '---',
        'name: First Skill',
        'description: Imported from a multi-skill archive',
        '---',
        '',
        'First instructions.',
      ].join('\n'),
      'second-skill/skill.md': [
        '---',
        'name: Second Skill',
        'description: Imported from a legacy markdown filename',
        '---',
        '',
        'Second instructions.',
      ].join('\n'),
      '__MACOSX/second-skill/._skill.md': 'ignored',
    }),
  })
  assert.deepEqual(multiZipImport.imported.map((skill) => skill.id).sort(), ['first-skill', 'second-skill'])
  assert.equal(existsSync(join(skillRoot, 'second-skill', 'SKILL.md')), true)
  assert.equal(existsSync(join(skillRoot, '__MACOSX')), false)

  assert.throws(
    () => manager.importSkill({
      fileName: 'escape.zip',
      bytes: createStoredZip({
        '../escape/SKILL.md': 'nope',
      }),
    }),
    /invalid relative paths/i,
  )

  console.log('Skill management smoke check passed')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

function createStoredZip(files: Record<string, string | Buffer>): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const [name, value] of Object.entries(files)) {
    const nameBytes = Buffer.from(name, 'utf8')
    const data = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8')
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt32LE(0, 10)
    localHeader.writeUInt32LE(0, 14)
    localHeader.writeUInt32LE(data.byteLength, 18)
    localHeader.writeUInt32LE(data.byteLength, 22)
    localHeader.writeUInt16LE(nameBytes.byteLength, 26)
    localHeader.writeUInt16LE(0, 28)
    localParts.push(localHeader, nameBytes, data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt32LE(0, 12)
    centralHeader.writeUInt32LE(0, 16)
    centralHeader.writeUInt32LE(data.byteLength, 20)
    centralHeader.writeUInt32LE(data.byteLength, 24)
    centralHeader.writeUInt16LE(nameBytes.byteLength, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    centralParts.push(centralHeader, nameBytes)

    offset += localHeader.byteLength + nameBytes.byteLength + data.byteLength
  }

  const localData = Buffer.concat(localParts)
  const centralData = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(Object.keys(files).length, 8)
  eocd.writeUInt16LE(Object.keys(files).length, 10)
  eocd.writeUInt32LE(centralData.byteLength, 12)
  eocd.writeUInt32LE(localData.byteLength, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([localData, centralData, eocd])
}
