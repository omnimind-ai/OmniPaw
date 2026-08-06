# OmniPaw 应用更新 Worker

该 Worker 提供版本检查和 Windows 更新文件分发。版本元数据、安装包、blockmap 与 `latest.yml` 保存在 Cloudflare R2，Worker 负责参数校验、缓存响应和单段 HTTP Range 请求。

当前 Electron 客户端在 Windows 正式安装包中支持应用内下载、下载进度显示和重启安装。macOS 仍显示发布页下载入口，待签名与公证条件具备后再启用应用内更新。

## 服务接口

版本检查：

```text
GET /updates?currentVersion=0.1.0
```

更新文件：

```text
GET  /artifacts/stable/windows/x64/full/latest.yml
GET  /artifacts/stable/windows/x64/full/<installer>.exe
GET  /artifacts/stable/windows/x64/full/<installer>.exe.blockmap
HEAD /artifacts/stable/windows/x64/full/<filename>
```

更新文件接口支持 `Range: bytes=start-end`。`latest.yml` 使用 `Cache-Control: no-store`，带版本号的安装包和 blockmap 使用长期不可变缓存。

## R2 文件结构

Wrangler 配置使用名为 `omnipaw-app-updates` 的 R2 存储桶，并以 `UPDATE_ASSETS` 绑定到 Worker。

```text
omnipaw-app-updates
├── metadata
│   └── version.json
└── artifacts
    └── stable
        └── windows
            └── x64
                ├── full
                │   ├── latest.yml
                │   ├── OmniPaw-<version>-windows-x64-with-omniinfer.exe
                │   └── OmniPaw-<version>-windows-x64-with-omniinfer.exe.blockmap
                └── slim
                    ├── latest.yml
                    ├── OmniPaw-<version>-windows-x64.exe
                    └── OmniPaw-<version>-windows-x64.exe.blockmap
```

保留仍有客户端使用版本的安装包和 blockmap，增量下载会读取当前版本与目标版本的 blockmap。缺少旧文件时，`electron-updater` 会改为下载完整安装包。

## 首次创建 R2 存储桶

在仓库根目录登录 Cloudflare 并创建存储桶：

```bash
pnpm dlx wrangler login
pnpm dlx wrangler r2 bucket create omnipaw-app-updates
```

首次发布 Worker 前，将当前版本信息写入 R2：

```bash
pnpm dlx wrangler r2 object put \
  omnipaw-app-updates/metadata/version.json \
  --file workers/app-update-worker/version.json \
  --content-type "application/json; charset=utf-8" \
  --remote
```

R2 绑定存在且 `metadata/version.json` 尚未创建时，版本检查会返回 HTTP 503。该行为可以避免客户端在安装文件准备完成之前收到新版本提示。

## 使用 Wrangler 发布 Worker

在仓库根目录执行：

```bash
pnpm dlx wrangler deploy --config workers/app-update-worker/wrangler.toml
```

`wrangler.toml` 已包含 R2 绑定：

```toml
[[r2_buckets]]
binding = "UPDATE_ASSETS"
bucket_name = "omnipaw-app-updates"
```

部署完成后的服务地址为：

```text
https://omnipaw-app-update-worker.dx390264.workers.dev
```

## 通过 Git 仓库发布 Worker

Cloudflare Dashboard 可以监听 `main` 分支中的 Worker 文件变化。

在 `Workers & Pages` 中创建或打开 `omnipaw-app-update-worker`，进入 `Settings` 的构建设置并连接 GitHub 仓库。填写以下配置：

| 配置项 | 配置值 |
| --- | --- |
| Production branch | `main` |
| Root directory | `workers/app-update-worker` |
| Build command | 留空 |
| Deploy command | `npx wrangler deploy` |

构建监视范围可以设置为：

```text
workers/app-update-worker/**
```

R2 存储桶需要先按前一节创建。Cloudflare 发布 Worker 时会读取 `wrangler.toml` 并建立 `UPDATE_ASSETS` 绑定。

## 配置 GitHub Actions 发布权限

仓库的 `.github/workflows/release.yml` 会为 Windows full 与 slim 安装包生成 updater 文件，并上传到 R2。仓库需要添加两个 Actions Secrets：

| Secret | 用途 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 S3 API Access Key ID |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 S3 API Secret Access Key |

在 Cloudflare Dashboard 的 R2 页面中进入 `Manage R2 API tokens`，创建仅限 `omnipaw-app-updates` 存储桶且具有 `Object Read & Write` 权限的凭据。创建完成页面会显示 Access Key ID、Secret Access Key 与 S3 API 地址，其中 Secret Access Key 仅显示一次。账户 ID 可在 Cloudflare Dashboard 的账户概览中获取。

GitHub 托管的 Ubuntu runner 使用 AWS CLI 连接 R2 的 S3 兼容接口。AWS CLI 会为较大的安装包自动采用分段上传，适合包含 OmniInfer 的 full 安装包。Cloudflare 的相关配置参见 [R2 CLI 指南](https://developers.cloudflare.com/r2/get-started/cli/) 和 [上传对象](https://developers.cloudflare.com/r2/objects/upload-objects/)。

推送符合 `vX.Y.Z` 形式且属于 `main` 分支历史的标签后，发布任务依次完成以下内容：

1. 构建 full 与 slim Windows 安装包。
2. 生成对应的 `.exe.blockmap` 和 `latest.yml`。
3. 将两类更新文件分别写入 R2。
4. 创建 GitHub Release。
5. 最后将 `workers/app-update-worker/version.json` 写入 `metadata/version.json`。

第 5 步位于安装文件与 GitHub Release 完成之后，因此客户端只会看到已经具备下载文件的版本。

## 本地测试

运行 Worker 单元测试：

```bash
pnpm test:update-worker
```

本地 Wrangler 环境使用独立的 R2 数据。先写入本地版本信息，再启动服务：

```bash
pnpm dlx wrangler r2 object put \
  omnipaw-app-updates/metadata/version.json \
  --file workers/app-update-worker/version.json \
  --local \
  --config workers/app-update-worker/wrangler.toml

pnpm dlx wrangler dev --config workers/app-update-worker/wrangler.toml
```

访问以下地址检查响应：

```text
http://localhost:8787/
http://localhost:8787/updates?currentVersion=0.0.9
```

## Electron 客户端地址

版本服务默认地址定义在 `electron/update-checker.ts`，更新文件默认地址定义在 `electron/update-controller.ts` 与 `electron-builder.config.cjs`。

开发或测试环境可以使用环境变量覆盖：

```powershell
$env:OMNIPAW_UPDATE_INFO_URL='https://example.workers.dev'
$env:OMNIPAW_UPDATE_ARTIFACTS_URL='https://example.workers.dev/artifacts/stable'
pnpm dev
```

`OMNIPAW_UPDATE_FEED_URL` 可以覆盖完整 feed 地址，适合针对单个安装包变体进行验证。正式安装包要求更新 feed 使用 HTTPS。
