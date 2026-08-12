import { cpSync, mkdirSync, realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const stageRoot = join(process.cwd(), 'tmp', 'package-runtime', 'node_modules')

rmSync(stageRoot, { recursive: true, force: true })
mkdirSync(stageRoot, { recursive: true })

const betterSqlitePackageJson = require.resolve('better-sqlite3/package.json')
const bindingsPackageJson = require.resolve('bindings/package.json', {
  paths: [dirname(betterSqlitePackageJson)],
})
const fileUriToPathPackageJson = require.resolve('file-uri-to-path/package.json', {
  paths: [dirname(bindingsPackageJson)],
})

// sqlite-vec is a SQLite loadable extension loaded at runtime via
// db.loadExtension(getLoadablePath()). Stage the JS wrapper and the
// prebuilt binary for the current build platform. The package restricts
// subpath "exports", so resolve via its main entry and getLoadablePath()
// (both exported) instead of package.json.
const sqliteVecMainFile = require.resolve('sqlite-vec')
const sqliteVecPlatformBinary = require('sqlite-vec').getLoadablePath()
const sqliteVecPlatformPackage = basename(dirname(sqliteVecPlatformBinary))

for (const [packageName, packageFile] of [
  ['better-sqlite3', betterSqlitePackageJson],
  ['bindings', bindingsPackageJson],
  ['file-uri-to-path', fileUriToPathPackageJson],
  ['sqlite-vec', sqliteVecMainFile],
  [sqliteVecPlatformPackage, sqliteVecPlatformBinary],
]) {
  stagePackage(packageName, packageFile)
}

function stagePackage(packageName, packageJson) {
  const source = realpathSync(dirname(packageJson))
  const target = join(stageRoot, packageName)
  cpSync(source, target, {
    recursive: true,
    dereference: true,
    force: true,
  })
  console.log(`Staged runtime dependency: ${packageName}`)
}
