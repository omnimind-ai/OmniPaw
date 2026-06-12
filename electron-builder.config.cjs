/* eslint-disable @typescript-eslint/no-require-imports */
// electron-builder config.
//
// Reads `OMNICLAW_BUNDLE_OMNIINFER` env (default = "1") to decide whether to bundle
// the OmniInfer binary as an extra resource. Run via:
//   pnpm build:full   # bundle OmniInfer (default; safe to omit env)
//   pnpm build:slim   # exclude OmniInfer; user provides binary at runtime

const bundleOmniInferRaw = (process.env.OMNICLAW_BUNDLE_OMNIINFER ?? '1').trim()
const bundleOmniInfer = bundleOmniInferRaw !== '0' && bundleOmniInferRaw.toLowerCase() !== 'false'

const extraResources = []
if (bundleOmniInfer) {
  extraResources.push({
    from: 'resources/omniinfer/',
    to: 'omniinfer/',
    filter: ['**/*', '!.gitkeep', '!*.log'],
  })
}

module.exports = {
  appId: 'com.openomniclaw.desktop',
  productName: 'OpenOmniClaw',
  directories: {
    output: 'release',
  },
  files: [
    'out/**/*',
    'resources/**/*',
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
  },
  mac: {
    icon: 'resources/app-icon.icns',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
}
