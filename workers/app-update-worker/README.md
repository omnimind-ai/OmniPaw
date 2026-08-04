# OmniPaw 应用更新 Worker

该包提供 OmniPaw 的版本检查服务。当前阶段负责比较客户端版本与最新版本，并返回发布信息；安装包下载和差量更新由后续功能负责。

## 接口

```text
GET /updates?currentVersion=0.1.0
```

发布信息维护在 [`version.json`](./version.json) 中。请求成功时，响应包含 `currentVersion`、`latestVersion`、`hasUpdate` 以及经过校验的发布信息。

## 维护版本信息

发布新版本时，修改 `version.json`：

```json
{
  "version": "0.1.0",
  "release_date": "2026-07-31",
  "changelog": ["首次发布", "- OmniPaw 首次版本"],
  "downloads": {
    "github": "https://github.com/omnimind-ai/OmniPaw/releases/latest"
  }
}
```

其中 `version` 使用语义化版本号，`release_date` 使用 `YYYY-MM-DD` 格式，`changelog` 保存更新内容，`downloads` 保存下载地址。

## 本地开发与测试

在仓库根目录运行测试：

```bash
pnpm test:update-worker
```

使用 Wrangler 启动本地服务：

```bash
pnpm dlx wrangler dev --config workers/app-update-worker/wrangler.toml
```

服务启动后可访问：

```text
http://localhost:8787/updates?currentVersion=0.0.9
```

## 通过 Git 仓库部署到 Cloudflare

该方式适合当前 monorepo。提交 `workers/app-update-worker` 中的文件后，Cloudflare 可以自动发布 Worker。

### 创建 Worker

1. 将项目推送至 GitHub 或 GitLab。
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 `Workers & Pages`。
3. 创建一个 Worker，名称填写 `omnipaw-app-update-worker`。
4. 进入该 Worker 的 `Settings`，打开 `Builds`，连接项目仓库。

Worker 名称需要与 [`wrangler.toml`](./wrangler.toml) 中的 `name` 保持一致。

### 配置构建

在 Cloudflare 的构建配置中填写以下内容：

| 配置项 | 配置值 |
| --- | --- |
| Production branch | `main` |
| Root directory | `workers/app-update-worker` |
| Build command | 留空 |
| Deploy command | `npx wrangler deploy` |

当前 Worker 使用普通 JavaScript，因此构建命令可以留空。Cloudflare 会在根目录中读取 `wrangler.toml` 并执行发布。

为了仅在 Worker 文件变化时触发发布，可以在构建监视配置中添加包含规则：

```text
workers/app-update-worker/**
```

保存配置并执行首次部署。此后修改 `version.json` 并推送到 `main`，Cloudflare 会自动发布新的版本信息。

相关官方文档：

1. [Workers Builds 配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
2. [monorepo 项目配置](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/)
3. [构建监视规则](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/)

## 使用 Wrangler 发布

也可以从仓库根目录执行命令发布：

```bash
pnpm dlx wrangler login
pnpm dlx wrangler deploy --config workers/app-update-worker/wrangler.toml
```

首次执行 `wrangler login` 时，浏览器会打开 Cloudflare 授权页面。发布完成后，Wrangler 会输出 Worker 地址，例如：

```text
https://omnipaw-app-update-worker.dx390264.workers.dev
```

Wrangler 的使用方式参见 [Cloudflare Wrangler 指南](https://developers.cloudflare.com/workers/get-started/guide/)。

## 验证线上服务

访问以下地址检查线上服务：

```text
https://omnipaw-app-update-worker.dx390264.workers.dev/updates?currentVersion=0.0.9
```

当 `version.json` 中的版本高于请求中的 `currentVersion` 时，响应里的 `hasUpdate` 为 `true`。

## 配置 Electron 客户端

获得 Worker 地址后，将服务根地址填写到 `electron/update-checker.ts` 的 `DEFAULT_UPDATE_SERVICE_URL`：

```ts
const DEFAULT_UPDATE_SERVICE_URL
  = 'https://omnipaw-app-update-worker.dx390264.workers.dev'
```

客户端会在该地址后补充 `/updates` 和 `currentVersion` 查询参数。

开发期间也可以通过环境变量指定地址：

```powershell
$env:OMNIPAW_UPDATE_INFO_URL='https://omnipaw-app-update-worker.dx390264.workers.dev'
pnpm dev
```

`version.json` 更新并发布后，Electron 的启动检查和“检查更新”功能会读取新的版本信息。
