import { cpSync, mkdirSync, realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

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

for (const [packageName, packageJson] of [
  ['better-sqlite3', betterSqlitePackageJson],
  ['bindings', bindingsPackageJson],
  ['file-uri-to-path', fileUriToPathPackageJson],
]) {
  stagePackage(packageName, packageJson)
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
