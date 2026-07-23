#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'

const RELEASE_REPOSITORY = 'omnimind-ai/OmniInfer'
const TARGETS = {
  'linux-x64': {
    archiveExtension: 'tar.gz',
    cliNames: ['omniinfer', 'OmniInfer', 'omniinfer-cli'],
    hostArch: 'x64',
    hostPlatform: 'linux',
  },
  'macos-arm64': {
    archiveExtension: 'tar.gz',
    cliNames: ['omniinfer', 'OmniInfer', 'omniinfer-cli'],
    hostArch: 'arm64',
    hostPlatform: 'darwin',
  },
  'windows-x64': {
    archiveExtension: 'zip',
    cliNames: ['omniinfer.exe', 'OmniInfer.exe', 'omniinfer-cli.exe'],
    hostArch: 'x64',
    hostPlatform: 'win32',
  },
}

const options = parseArguments(process.argv.slice(2))
const version = normalizeVersion(options.version ?? process.env.OMNIINFER_VERSION)
const targetName = options.target ?? process.env.OMNIINFER_TARGET
const target = TARGETS[targetName]

if (!target) {
  fail(`Unsupported OmniInfer target: ${targetName || '(empty)'}`)
}

const repositoryRoot = process.cwd()
const outputDir = resolve(options.output ?? join(repositoryRoot, 'resources', 'omniinfer'))
assertManagedOutputDirectory(repositoryRoot, outputDir)

const tag = `v${version}`
const assetName = `omniinfer-${tag}-${targetName}.${target.archiveExtension}`
const releaseBaseUrl = `https://github.com/${RELEASE_REPOSITORY}/releases/download/${tag}`
const temporaryRoot = mkdtempSync(join(tmpdir(), 'omnipaw-omniinfer-'))

try {
  const [checksums, archive] = await Promise.all([
    download(`${releaseBaseUrl}/checksums.txt`),
    download(`${releaseBaseUrl}/${assetName}`),
  ])
  const expectedChecksum = findExpectedChecksum(checksums.toString('utf8'), assetName)
  const actualChecksum = createHash('sha256').update(archive).digest('hex')
  if (actualChecksum !== expectedChecksum) {
    fail(
      `OmniInfer checksum mismatch for ${assetName}: expected ${expectedChecksum}, received ${actualChecksum}`
    )
  }

  const archivePath = join(temporaryRoot, assetName)
  const extractedDir = join(temporaryRoot, 'extracted')
  writeFileSync(archivePath, archive)
  mkdirSync(extractedDir, { recursive: true })
  validateArchiveEntries(archivePath)
  extractArchive(archivePath, extractedDir)

  const runtimeDir = locateRuntimeDirectory(extractedDir, target.cliNames)
  if (!runtimeDir) {
    fail(`OmniInfer executable was not found after extracting ${assetName}`)
  }

  clearManagedOutputDirectory(outputDir)
  copyDirectoryContents(runtimeDir, outputDir)

  const cliPath = findCli(outputDir, target.cliNames)
  if (!cliPath) {
    fail(`OmniInfer executable was not staged in ${outputDir}`)
  }

  verifyVersionFile(outputDir, version, targetName)
  verifyExecutableWhenNative(cliPath, target, version)

  const manifest = {
    repository: RELEASE_REPOSITORY,
    version,
    tag,
    target: targetName,
    asset: assetName,
    sha256: actualChecksum,
  }
  writeFileSync(
    join(outputDir, 'omniinfer-release.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  )
  publishActionOutputs({
    omniinfer_asset: assetName,
    omniinfer_sha256: actualChecksum,
    omniinfer_target: targetName,
    omniinfer_version: version,
  })
  process.stdout.write(
    `[omniinfer] staged ${assetName} in ${outputDir} (${actualChecksum.slice(0, 12)}...)\n`
  )
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}

function parseArguments(args) {
  const parsed = {}
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--version' || argument === '--target' || argument === '--output') {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) {
        fail(`${argument} requires a value`)
      }
      parsed[argument.slice(2)] = value
      index += 1
      continue
    }
    if (argument === '--help') {
      process.stdout.write(
        [
          'Usage: node scripts/prepare-omniinfer-resource.mjs --version <version> --target <target>',
          '',
          `Targets: ${Object.keys(TARGETS).join(', ')}`,
          'Optional: --output <directory>',
          '',
        ].join('\n')
      )
      process.exit(0)
    }
    fail(`Unknown argument: ${argument}`)
  }
  return parsed
}

function normalizeVersion(rawVersion) {
  const version = rawVersion?.trim().replace(/^v/i, '')
  if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`Invalid OmniInfer version: ${rawVersion || '(empty)'}`)
  }
  return version
}

async function download(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'OmniPaw-Autobuild',
    },
    redirect: 'follow',
  })
  if (!response.ok) {
    fail(`Failed to download ${url}: HTTP ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

function findExpectedChecksum(contents, assetName) {
  for (const line of contents.split(/\r?\n/)) {
    const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line.trim())
    if (match && match[2] === assetName) {
      return match[1].toLowerCase()
    }
  }
  fail(`checksums.txt does not contain ${assetName}`)
}

function validateArchiveEntries(archivePath) {
  const result = runTar(['-tf', archivePath], { capture: true })
  for (const rawEntry of result.stdout.split(/\r?\n/)) {
    const entry = rawEntry
      .trim()
      .replaceAll('\\', '/')
      .replace(/^\.\/+/, '')
    if (!entry) continue
    const parts = entry.split('/').filter(Boolean)
    if (entry.startsWith('/') || /^[A-Za-z]:/.test(entry) || parts.some((part) => part === '..')) {
      fail(`Unsafe archive entry in ${archivePath}: ${rawEntry}`)
    }
  }
}

function extractArchive(archivePath, outputDir) {
  runTar(['-xf', archivePath, '-C', outputDir])
}

function runTar(args, options = {}) {
  const result = spawnSync('tar', args, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
  if (result.error) {
    fail(`Failed to launch tar: ${result.error.message}`)
  }
  if (result.status !== 0) {
    fail(`tar exited with status ${result.status}: ${result.stderr || ''}`.trim())
  }
  return result
}

function locateRuntimeDirectory(root, cliNames) {
  const candidates = [root]
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      candidates.push(join(root, entry.name))
    }
  }
  return candidates.find((candidate) => Boolean(findCli(candidate, cliNames)))
}

function findCli(directory, cliNames) {
  return cliNames
    .map((name) => join(directory, name))
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile())
}

function clearManagedOutputDirectory(directory) {
  mkdirSync(directory, { recursive: true })
  for (const entry of readdirSync(directory)) {
    if (entry === '.gitkeep') continue
    rmSync(join(directory, entry), { recursive: true, force: true })
  }
}

function copyDirectoryContents(source, destination) {
  mkdirSync(destination, { recursive: true })
  for (const entry of readdirSync(source)) {
    cpSync(join(source, entry), join(destination, entry), {
      recursive: true,
      dereference: false,
      force: true,
      preserveTimestamps: true,
    })
  }
}

function verifyVersionFile(directory, expectedVersion, expectedTarget) {
  const versionPath = join(directory, 'VERSION')
  if (!existsSync(versionPath)) {
    fail(`OmniInfer VERSION file is missing from ${directory}`)
  }
  const [rawVersion, actualTarget] = readFileSync(versionPath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
  const actualVersion = rawVersion?.replace(/^v/i, '')
  if (actualVersion !== expectedVersion) {
    fail(`OmniInfer VERSION mismatch: expected ${expectedVersion}, received ${actualVersion}`)
  }
  if (actualTarget && actualTarget !== expectedTarget) {
    fail(`OmniInfer target mismatch: expected ${expectedTarget}, received ${actualTarget}`)
  }
}

function verifyExecutableWhenNative(cliPath, target, expectedVersion) {
  if (process.platform !== target.hostPlatform || process.arch !== target.hostArch) {
    return
  }
  const result = spawnSync(cliPath, ['--version'], {
    cwd: outputDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  if (result.error) {
    fail(`Failed to execute ${cliPath}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    fail(`${cliPath} --version exited with status ${result.status}: ${result.stderr || ''}`.trim())
  }
  const actualVersion = result.stdout.trim()
  const expectedOutput = `omniinfer ${expectedVersion}`
  if (actualVersion !== expectedOutput) {
    fail(`OmniInfer executable mismatch: expected "${expectedOutput}", received "${actualVersion}"`)
  }
}

function assertManagedOutputDirectory(repositoryRoot, directory) {
  const relativeDirectory = relative(repositoryRoot, directory)
  if (
    !relativeDirectory ||
    relativeDirectory.startsWith('..') ||
    isAbsolute(relativeDirectory) ||
    relativeDirectory.split(/[\\/]/).length < 2
  ) {
    fail(`Refusing to manage OmniInfer output directory: ${directory}`)
  }
}

function publishActionOutputs(outputs) {
  const outputFile = process.env.GITHUB_OUTPUT
  if (!outputFile) return
  for (const [name, value] of Object.entries(outputs)) {
    appendFileSync(outputFile, `${name}=${value}\n`, 'utf8')
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}
