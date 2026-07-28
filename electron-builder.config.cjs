/* eslint-disable @typescript-eslint/no-require-imports */
// electron-builder config.
//
// Reads `OMNIPAW_BUNDLE_OMNIINFER` env (default = "1") to decide whether to bundle
// the OmniInfer CLI and base CPU backend as extra resources. Run via:
//   pnpm build:full   # bundle OmniInfer with the base backend (default; safe to omit env)
//   pnpm build:slim   # exclude OmniInfer; user provides binary at runtime

const bundleOmniInferRaw = (process.env.OMNIPAW_BUNDLE_OMNIINFER ?? '1').trim()
const bundleOmniInfer = bundleOmniInferRaw !== '0' && bundleOmniInferRaw.toLowerCase() !== 'false'
const buildNumber = process.env.OMNIPAW_BUILD_NUMBER?.trim()
const buildVersion = process.env.OMNIPAW_BUILD_VERSION?.trim()
const macBundleVersion = process.env.OMNIPAW_MAC_BUNDLE_VERSION?.trim()
const macBundleShortVersion = process.env.OMNIPAW_MAC_BUNDLE_SHORT_VERSION?.trim()
const artifactSuffix = process.env.OMNIPAW_ARTIFACT_SUFFIX?.trim() || ''
const requireMacSigning = parseBooleanEnv('OMNIPAW_REQUIRE_MAC_SIGNING', false)

const extraResources = []
if (bundleOmniInfer) {
  extraResources.push({
    from: 'resources/omniinfer/',
    to: 'omniinfer/',
    filter: ['**/*', '!.gitkeep', '!*.log'],
  })
}

module.exports = {
  appId: 'com.omnipaw.desktop',
  productName: 'OmniPaw',
  ...(buildNumber ? { buildNumber } : {}),
  ...(buildVersion ? { buildVersion } : {}),
  directories: {
    output: 'release',
  },
  files: [
    'out/**/*',
    'resources/**/*',
    '!resources/omniinfer/**/*',
    'package.json',
    {
      from: 'tmp/package-runtime/node_modules',
      to: 'node_modules',
      filter: ['**/*'],
    },
  ],
  extraResources,
  asarUnpack: ['**/*.node'],
  win: {
    target: 'nsis',
    icon: 'resources/app-icon.ico',
    artifactName: `\${productName}-\${version}-windows-\${arch}${artifactSuffix}.\${ext}`,
  },
  mac: {
    icon: 'resources/app-icon.icns',
    artifactName: `\${productName}-\${version}-macos-\${arch}${artifactSuffix}.\${ext}`,
    // Local builds use a complete ad-hoc signature instead of shipping the
    // linker-only Electron signature that macOS reports as "damaged".
    // Release CI requires a Developer ID identity and notarization.
    identity: requireMacSigning ? undefined : '-',
    forceCodeSigning: requireMacSigning,
    hardenedRuntime: true,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: requireMacSigning,
    ...(macBundleVersion ? { bundleVersion: macBundleVersion } : {}),
    ...(macBundleShortVersion ? { bundleShortVersion: macBundleShortVersion } : {}),
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
}

function parseBooleanEnv(name, fallback) {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return fallback
  if (raw === '1' || raw === 'true') return true
  if (raw === '0' || raw === 'false') return false
  throw new Error(`${name} must be one of: 1, 0, true, false`)
}
