# macOS 代码签名与公证配置（Apple Developer 付费账号）

本文说明在已拥有 Apple Developer 付费账号的前提下，如何为文思 AI 写作配置正式签名与公证，使 DMG 安装后可直接双击打开、无「无法验证开发者」提示。

## 一、在 Apple 后台创建证书

1. **创建 CSR（证书签名请求）**
   - 打开 Mac 上「钥匙串访问」→ 菜单「钥匙串访问」→「证书助理」→「从证书颁发机构请求证书」
   - 填写邮箱、常用名称，选择「存储到磁盘」，生成 `.certSigningRequest` 文件

2. **在 Apple Developer 创建证书**
   - 登录 [Apple Developer → Certificates, IDs & Profiles](https://developer.apple.com/account/resources/certificates/list)
   - 点击「Create a certificate」
   - 选择 **Developer ID Application**（用于在 App Store 外分发，DMG 即属此类）
   - 上传上一步的 CSR，完成创建后下载 `.cer` 文件

3. **安装证书到本机**
   - 双击 `.cer`，按提示安装到「登录」钥匙串

## 二、获取签名身份（Signing Identity）

在终端执行：

```bash
security find-identity -v -p codesigning
```

在输出中找到 **Developer ID Application: 你的名字 (TEAM_ID)** 这一行，引号内的整段即为 `signingIdentity`，例如：

```
1) XXXXX "Developer ID Application: Your Name (ABC123XYZ)"
```

则签名身份为：`Developer ID Application: Your Name (ABC123XYZ)`。

## 三、配置 Tauri 使用该证书

任选其一即可。

### 方式 A：环境变量（推荐，不把身份写进仓库）

构建前设置环境变量再执行构建：

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (ABC123XYZ)"
./scripts/build.sh macos
```

或一行：

```bash
APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (ABC123XYZ)" ./scripts/build.sh macos
```

### 方式 B：写在配置里

在 `src-tauri/tauri.conf.json` 的 `bundle.macOS` 中设置：

```json
"signingIdentity": "Developer ID Application: Your Name (ABC123XYZ)"
```

注意：若把该文件提交到 Git，签名身份会进入仓库；团队协作或公开仓库时更推荐用方式 A。

## 四、公证（Notarization，可选但推荐）

公证后，用户从网络下载的 DMG 安装并双击打开时，系统不会提示「已损坏」或要求右键打开。

### 用 Apple ID 做公证

1. **生成 App 专用密码**
   - 打开 [appleid.apple.com](https://appleid.apple.com) → 登录与安全性 → App 专用密码 → 生成新密码，复制保存

2. **构建时提供环境变量**

   ```bash
   export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (ABC123XYZ)"
   export APPLE_ID="你的 Apple ID 邮箱"
   export APPLE_PASSWORD="上一步生成的 App 专用密码"
   ./scripts/build.sh macos
   ```

Tauri 会在签名后自动提交公证；构建日志中可看到 notarization 进度。

### 用 App Store Connect API Key（适合 CI）

在 [App Store Connect → 用户与访问 → 集成](https://appstoreconnect.apple.com/access/integrations) 中创建 API Key，下载 `.p8` 私钥（仅能下载一次），然后设置：

- `APPLE_API_KEY_PATH`：`.p8` 文件路径
- `APPLE_API_KEY`：Key ID
- `APPLE_API_ISSUER`：Issuer ID（同页可见）

无需再设置 `APPLE_ID` / `APPLE_PASSWORD`。

## 五、当前项目配置说明

- `tauri.conf.json` 中 `bundle.macOS.signingIdentity` 已设为 `null`，表示**不写死**身份，由环境变量 `APPLE_SIGNING_IDENTITY` 控制。
- 未设置 `APPLE_SIGNING_IDENTITY` 时，Tauri 可能不签名或使用 ad-hoc；要得到可对外分发的 DMG，请按上文设置证书并配置身份（及可选公证环境变量）后再构建。

## 参考

- [Tauri: macOS Code Signing](https://v2.tauri.app/distribute/sign/macos/)
- [Apple: 创建证书签名请求](https://developer.apple.com/help/account/create-certificates/create-a-certificate-signing-request)
