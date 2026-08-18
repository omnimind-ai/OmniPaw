import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
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
const sandboxRuntimePackageJson = require.resolve('@anthropic-ai/sandbox-runtime/package.json')
const sandboxRuntimeDependencies = [
  '@pondwader/socks5-server',
  'commander',
  'node-forge',
  'zod',
].map((packageName) => [
  packageName,
  resolvePackageManifest(packageName, dirname(sandboxRuntimePackageJson)),
])

for (const [packageName, packageFile] of [
  ['better-sqlite3', betterSqlitePackageJson],
  ['bindings', bindingsPackageJson],
  ['file-uri-to-path', fileUriToPathPackageJson],
  ['sqlite-vec', sqliteVecMainFile],
  [sqliteVecPlatformPackage, sqliteVecPlatformBinary],
  ['@anthropic-ai/sandbox-runtime', sandboxRuntimePackageJson],
  ...sandboxRuntimeDependencies,
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

function resolvePackageManifest(packageName, fromDirectory) {
  const entry = require.resolve(packageName, { paths: [fromDirectory] })
  let current = dirname(entry)
  while (true) {
    const manifest = join(current, 'package.json')
    if (existsSync(manifest)) {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
      if (parsed.name === packageName) return manifest
    }
    const parent = dirname(current)
    if (parent === current) {
      throw new Error(`Cannot locate package manifest for ${packageName}`)
    }
    current = parent
  }
}
