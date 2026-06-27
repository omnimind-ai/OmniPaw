import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { builtinModules, createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const appRoot = join('release', 'mac-arm64', 'OmniPaw.app', 'Contents', 'Resources')
const asarPath = join(appRoot, 'app.asar')
const unpackedRoot = join(appRoot, 'app.asar.unpacked')
const bundleFiles = [join('out', 'main', 'main.cjs'), join('out', 'preload', 'preload.cjs')]
const ignoredRequires = new Set([
  'electron',
  'url',
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
])

if (!existsSync(asarPath)) {
  fail(`Packaged asar not found: ${asarPath}`)
}

const packageEntries = new Set(
  loadAsar()
    .listPackage(asarPath, { isPack: false })
    .map((line) => line.trim())
    .filter(Boolean)
)

const externalRequires = findExternalRequires()
const missingPackages = []
for (const request of externalRequires) {
  const packageName = toPackageName(request)
  if (!packageEntries.has(`/node_modules/${packageName}/package.json`)) {
    missingPackages.push(request)
  }
}

const nativeBinding = join(
  unpackedRoot,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node'
)
if (externalRequires.has('better-sqlite3') && !existsSync(nativeBinding)) {
  missingPackages.push(`better-sqlite3 native binding (${nativeBinding})`)
}

if (missingPackages.length > 0) {
  fail(`Packaged app is missing runtime dependencies: ${missingPackages.join(', ')}`)
}

console.log(
  `Packaged app runtime dependency check passed. External runtime packages: ${
    [...externalRequires].join(', ') || 'none'
  }`
)

function findExternalRequires() {
  const requires = new Set()
  const requirePattern = /require\((['"])([^'"]+)\1\)/g
  for (const file of bundleFiles) {
    if (!existsSync(file)) {
      fail(`Build output not found: ${file}`)
    }
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(requirePattern)) {
      const request = match[2]
      if (!request.startsWith('.') && !request.startsWith('/') && !ignoredRequires.has(request)) {
        requires.add(request)
      }
    }
  }
  return requires
}

function toPackageName(request) {
  if (request.startsWith('@')) {
    const [scope, name] = request.split('/')
    return `${scope}/${name}`
  }
  return request.split('/')[0]
}

function loadAsar() {
  const pnpmStore = join(process.cwd(), 'node_modules', '.pnpm')
  const asarPackageDir = readdirSync(pnpmStore).find((entry) => entry.startsWith('@electron+asar@'))
  if (!asarPackageDir) {
    fail('Cannot locate @electron/asar in node_modules/.pnpm')
  }
  return require(
    join(pnpmStore, asarPackageDir, 'node_modules', '@electron', 'asar', 'lib', 'asar.js')
  )
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}
