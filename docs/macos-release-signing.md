# macOS 发布签名

自动构建支持 `adhoc` 和 `developer-id` 两种 macOS 签名模式。`dev-latest` 默认使用
`adhoc`，不需要 Apple Developer 账号；正式面向普通用户分发时，应选择
`developer-id` 并完成 Apple 公证。

## Ad-hoc 开发版

手动运行 `Autobuild` 时，保留默认的 `mac_signing_mode: adhoc` 即可。该模式会：

- 使用 `identity: "-"` 为 App、Electron Helpers、Frameworks 和内置 OmniInfer 添加
  完整 ad-hoc 签名；
- 启用 Hardened Runtime 和 Electron 所需 entitlements；
- 上传前执行 `codesign --verify --deep --strict`；
- 不连接 Apple 公证服务，也不需要任何 Apple Secrets。

ad-hoc 包不是 Apple 信任的互联网分发包。用户首次从 GitHub 下载后，需要在 Finder
中使用“打开”，或者前往“系统设置 → 隐私与安全性 → 仍要打开”。

## Developer ID 正式版

手动运行 `Autobuild` 时选择 `mac_signing_mode: developer-id`。该模式强制执行
Developer ID 签名、公证、Gatekeeper 检查和公证票据验证，任何一步失败都会阻止上传。

### GitHub Actions Secrets

仓库管理员需要配置以下 Secrets：

| Secret | 内容 |
|---|---|
| `MAC_CSC_LINK` | Developer ID Application `.p12` 文件的 Base64 内容 |
| `MAC_CSC_KEY_PASSWORD` | 导出 `.p12` 时设置的密码 |
| `APPLE_ID` | Apple Developer 账号 |
| `APPLE_APP_SPECIFIC_PASSWORD` | Apple ID 的 app-specific password |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

证书和密码只能通过 GitHub Secrets 注入，不得写入仓库、构建日志或发布产物。

工作流会根据所选模式设置 `OMNIPAW_REQUIRE_MAC_SIGNING`。没有 Developer ID 凭据时，
不要选择 `developer-id`；该模式不会静默降级为 ad-hoc。

## 验证

构建完成后可运行：

```sh
node scripts/verify-macos-signing.mjs --release-dir release
```

发布流水线使用更严格的检查：

```sh
node scripts/verify-macos-signing.mjs \
  --release-dir release \
  --require-notarization
```

严格模式会依次验证完整代码签名、Gatekeeper 判定和公证票据，并检查随包附带的
OmniInfer 可执行文件。
