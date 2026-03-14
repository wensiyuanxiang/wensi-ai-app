# 构建脚本

多平台 Release 构建，安装包输出到 **`scripts/releases/<版本>/<平台>/`**。

## 快速查看帮助

```bash
./scripts/build.sh --help
```

## 示例用法

### 构建 macOS 版本（在 Mac 上执行）

```bash
# 使用当前 package.json 中的版本构建
./scripts/build.sh macos

# 指定版本 0.0.5 构建，产物在 scripts/releases/0.0.5/macos/
./scripts/build.sh -v 0.0.5 macos
```

产物：`.app` 应用包、`.dmg` 安装镜像，位于 `scripts/releases/<版本>/macos/`。

### 构建 Windows 版本（在 Windows 上执行）

```bash
# 使用当前版本构建
./scripts/build.sh windows

# 指定版本 0.0.5 构建，产物在 scripts/releases/0.0.5/windows/
./scripts/build.sh --version 0.0.5 windows
```

产物：`.msi`、`.exe` 安装包，位于 `scripts/releases/<版本>/windows/`。  
注意：Windows 安装包需在 **Windows 系统** 或 CI 的 Windows 环境下执行本脚本。

### 构建 Linux 版本（在 Linux 上执行）

```bash
./scripts/build.sh -v 0.0.5 linux
```

产物：`.AppImage`、`.deb`，位于 `scripts/releases/<版本>/linux/`。

### 构建 Android / iOS

```bash
./scripts/build.sh -v 0.0.5 android   # 需配置 Android SDK
./scripts/build.sh -v 0.0.5 ios       # 需 macOS + Xcode
```

## 选项说明

| 选项 | 说明 |
|------|------|
| `-v, --version VERSION` | 指定版本号，会同步更新 package.json、tauri.conf.json、Cargo.toml 和 scripts/VERSION |
| `-h, --history` | 查看构建历史（时间、版本、平台、成功与否、输出路径） |
| `--list-platforms` | 列出支持的平台 |
| `--help` | 显示完整帮助（含用法与示例） |

## 查看构建历史

```bash
./scripts/build.sh --history
```

或直接打开 `scripts/build-history.json` 查看。

## 支持的平台与运行环境

| 平台 | 产物 | 建议运行环境 |
|------|------|----------------|
| macos | .app、.dmg | macOS |
| windows | .msi、.exe | Windows |
| linux | .AppImage、.deb | Linux |
| android | .apk | 已配置 Android SDK 的任意主机 |
| ios | iOS 应用 | macOS + Xcode |

## 文件说明

- **build.sh**：主构建脚本，从项目根目录执行
- **VERSION**：当前/最近一次构建使用的版本号
- **build-history.json**：每次构建记录（时间、版本、平台、是否成功、输出路径）
- **releases/**：各版本、各平台的安装包目录（默认已在 .gitignore 中忽略）
