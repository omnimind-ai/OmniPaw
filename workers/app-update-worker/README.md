# OmniPaw App Update Worker

This workspace package provides the first-stage OmniPaw update check service. It only compares
versions and returns release information; package download and differential update behavior remain
outside this package.

## API

```text
GET /updates?currentVersion=0.1.0
```

The release document is maintained in `version.json`. A successful response contains
`currentVersion`, `latestVersion`, `hasUpdate`, and the validated release document.

## Commands

From the repository root:

```bash
pnpm test:update-worker
```

For a local Cloudflare session without adding Wrangler to the repository:

```bash
pnpm dlx wrangler dev --config workers/app-update-worker/wrangler.toml
```

Deploy from the repository root with:

```bash
pnpm dlx wrangler deploy --config workers/app-update-worker/wrangler.toml
```

After deployment, set `DEFAULT_UPDATE_SERVICE_URL` in `electron/update-checker.ts` or provide the
`OMNIPAW_UPDATE_INFO_URL` environment variable with the Worker base URL.
