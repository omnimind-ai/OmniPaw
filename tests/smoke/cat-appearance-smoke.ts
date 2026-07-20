import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CatAppearanceManager } from '@core/role/appearance'

const tempDir = mkdtempSync(join(tmpdir(), 'omnipaw-cat-appearance-'))
const manager = new CatAppearanceManager({
  dataRootPath: tempDir,
  buildAssetUrl: (packId, assetKey, version) => `asset://${packId}/${assetKey}?v=${version}`,
})

try {
  manager.load()

  const builtInPacks = manager.list().packs
  assert.deepEqual(
    builtInPacks.map((pack) => pack.id),
    ['builtin', 'builtin-dog']
  )
  assert.equal(manager.getPack('builtin-dog').source, 'builtin')
  assert.equal(manager.setActive('builtin-dog').id, 'builtin-dog')
  assert.equal(manager.current().id, 'builtin-dog')
  assert.throws(() => manager.deletePack('builtin-dog'), /cannot be deleted/i)

  const rootZipPath = join(tempDir, 'root-pack.zip')
  writeFileSync(
    rootZipPath,
    createStoredZip({
      'manifest.json': JSON.stringify({
        version: 1,
        id: 'zip-cat',
        name: 'Zip Cat',
        assets: {
          idle: 'assets/idle.png',
        },
      }),
      'assets/idle.png': Buffer.from('png'),
    })
  )

  const rootImport = manager.importFromArchive(rootZipPath)
  assert.equal(rootImport.canceled, false)
  assert.equal(rootImport.importedPackId, 'zip-cat')
  assert.equal(rootImport.activePackId, 'zip-cat')
  assert.equal(existsSync(join(tempDir, 'cat-appearances', 'zip-cat', 'manifest.json')), true)
  assert.equal(manager.resolveAsset('zip-cat', 'idle')?.mimeType, 'image/png')

  const folderZipPath = join(tempDir, 'folder-pack.zip')
  writeFileSync(
    folderZipPath,
    createStoredZip({
      'folder-pack/manifest.json': JSON.stringify({
        version: 1,
        id: 'zip-cat',
        name: 'Zip Cat Duplicate',
        assets: {
          idle: 'assets/idle.webp',
        },
      }),
      'folder-pack/assets/idle.webp': Buffer.from('webp'),
    })
  )

  const folderImport = manager.importFromArchive(folderZipPath)
  assert.equal(folderImport.canceled, false)
  assert.equal(folderImport.importedPackId, 'zip-cat-2')
  assert.equal(folderImport.activePackId, 'zip-cat-2')
  assert.equal(existsSync(join(tempDir, 'cat-appearances', 'zip-cat-2', 'manifest.json')), true)
  assert.equal(manager.resolveAsset('zip-cat-2', 'idle')?.mimeType, 'image/webp')

  const deleteResult = manager.deletePack({ packId: 'zip-cat-2', rootName: 'zip-cat-2' })
  assert.equal(deleteResult.deletedPackId, 'zip-cat-2')
  assert.equal(deleteResult.activePackId, 'builtin')
  assert.equal(existsSync(join(tempDir, 'cat-appearances', 'zip-cat-2')), false)
  assert.throws(() => manager.deletePack('builtin'), /cannot be deleted/i)

  const escapeZipPath = join(tempDir, 'escape.zip')
  writeFileSync(
    escapeZipPath,
    createStoredZip({
      '../escape/manifest.json': '{}',
    })
  )
  assert.throws(() => manager.importFromArchive(escapeZipPath), /invalid relative paths/i)

  console.log('Cat appearance smoke check passed')
} finally {
  manager.dispose()
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
