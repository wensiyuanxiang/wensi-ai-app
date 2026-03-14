#!/usr/bin/env bash
# 文思AI写作 - 多平台 Release 构建脚本
# 用法: ./scripts/build.sh [选项] <平台>
# 平台: macos | windows | linux | android | ios
# 选项: -v|--version VERSION  指定版本号（如 0.0.5）
#       -h|--history         查看构建历史
#       --list-platforms     列出支持的平台

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASES_DIR="$SCRIPT_DIR/releases"
HISTORY_FILE="$SCRIPT_DIR/build-history.json"
VERSION_FILE="$SCRIPT_DIR/VERSION"
TAURI_DIR="$PROJECT_ROOT/src-tauri"
BUNDLE_BASE="$TAURI_DIR/target/release/bundle"

# 从 package.json 读取当前版本
get_current_version() {
  if [[ -f "$PROJECT_ROOT/package.json" ]]; then
    node -e "console.log(require('$PROJECT_ROOT/package.json').version)"
  else
    echo "0.0.5"
  fi
}

# 更新三处版本号
update_version() {
  local ver="$1"
  if [[ -z "$ver" ]]; then return; fi
  echo "Setting version to $ver ..."
  node -e "
    const fs = require('fs');
    const p = '$PROJECT_ROOT/package.json';
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.version = '$ver';
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  "
  node -e "
    const fs = require('fs');
    const p = '$PROJECT_ROOT/src-tauri/tauri.conf.json';
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.version = '$ver';
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  "
  sed -i.bak "s/^version = \".*\"/version = \"$ver\"/" "$PROJECT_ROOT/src-tauri/Cargo.toml" && rm -f "$PROJECT_ROOT/src-tauri/Cargo.toml.bak"
  echo "$ver" > "$VERSION_FILE"
}

# 追加构建历史
record_build() {
  local version="$1"
  local platform="$2"
  local success="$3"
  local out_path="$4"
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  if [[ ! -f "$HISTORY_FILE" ]]; then
    echo '[]' > "$HISTORY_FILE"
  fi
  node -e "
    const fs = require('fs');
    const path = process.argv[1];
    const version = process.argv[2];
    const platform = process.argv[3];
    const success = process.argv[4] === 'true';
    const outputPath = process.argv[5] || '';
    const date = process.argv[6];
    const arr = JSON.parse(fs.readFileSync(path, 'utf8'));
    arr.push({ date, version, platform, success, outputPath });
    fs.writeFileSync(path, JSON.stringify(arr, null, 2));
  " "$HISTORY_FILE" "$version" "$platform" "$success" "$out_path" "$ts"
}

# 显示构建历史
show_history() {
  if [[ ! -f "$HISTORY_FILE" ]]; then
    echo "No build history yet."
    return
  fi
  echo "=== Build History ==="
  node -e "
    const fs = require('fs');
    const arr = JSON.parse(fs.readFileSync('$HISTORY_FILE', 'utf8'));
    if (arr.length === 0) { console.log('(empty)'); process.exit(0); }
    arr.slice().reverse().forEach((e, i) => {
      const status = e.success ? 'OK' : 'FAIL';
      console.log(\`\${e.date}  \${e.version}  \${e.platform.padEnd(8)}  [\${status}]  \${e.outputPath || '-'}\`);
    });
  "
  if [[ -f "$VERSION_FILE" ]]; then
    echo ""
    echo "Latest version: $(cat "$VERSION_FILE")"
  fi
}

# 列出平台
list_platforms() {
  echo "Supported platforms: macos | windows | linux | android | ios"
  echo "Note: Windows/Linux builds require running on that OS (or CI)."
  echo "      Android/iOS require SDK and device targets."
}

# 显示帮助（含示例）
show_help() {
  cat <<'HELP'
文思AI写作 - 多平台 Release 构建脚本

用法:
  ./scripts/build.sh [选项] <平台>
  ./scripts/build.sh --help

选项:
  -v, --version VERSION    指定本次构建的版本号（如 0.0.5），会同步更新
                           package.json、tauri.conf.json、Cargo.toml 和 scripts/VERSION
  -h, --history            查看构建历史（时间、版本、平台、结果、输出路径）
  --list-platforms          列出支持的平台
  --help                    显示本帮助

平台:
  macos     macOS 安装包（.app + .dmg），需在 macOS 上执行
  windows   Windows 安装包（.msi + .exe），需在 Windows 上执行
  linux     Linux 安装包（.AppImage + .deb），需在 Linux 上执行
  android   Android 安装包（.apk），需配置 Android SDK
  ios       iOS 应用，需在 macOS 上且配置 Xcode

输出目录:
  scripts/releases/<版本>/<平台>/

示例:
  # 使用当前版本构建 macOS 安装包（在 Mac 上执行）
  ./scripts/build.sh macos

  # 指定版本 0.0.5 构建 macOS，产物在 scripts/releases/0.0.5/macos/
  ./scripts/build.sh -v 0.0.5 macos

  # 指定版本 0.0.5 构建 Windows 安装包（在 Windows 上执行）
  ./scripts/build.sh --version 0.0.5 windows

  # 不指定版本则使用 package.json 中的版本
  ./scripts/build.sh windows

  # 查看构建历史
  ./scripts/build.sh --history

  # 列出支持的平台
  ./scripts/build.sh --list-platforms
HELP
}

# 构建 macOS
build_macos() {
  cd "$PROJECT_ROOT"
  unset CI
  npx tauri build
  local out="$RELEASES_DIR/$VERSION/macos"
  mkdir -p "$out"
  cp -R "$BUNDLE_BASE/macos/"* "$out/" 2>/dev/null || true
  if [[ -d "$BUNDLE_BASE/dmg" ]]; then
    cp "$BUNDLE_BASE/dmg/"*.dmg "$out/" 2>/dev/null || true
  fi
  echo "$out"
}

# 构建 Windows（需在 Windows 上运行）
build_windows() {
  cd "$PROJECT_ROOT"
  unset CI
  npx tauri build --bundles msi,nsis
  local out="$RELEASES_DIR/$VERSION/windows"
  mkdir -p "$out"
  cp "$BUNDLE_BASE/msi/"*.msi "$out/" 2>/dev/null || true
  cp "$BUNDLE_BASE/nsis/"*.exe "$out/" 2>/dev/null || true
  echo "$out"
}

# 构建 Linux（需在 Linux 上运行）
build_linux() {
  cd "$PROJECT_ROOT"
  unset CI
  npx tauri build --bundles appimage,deb
  local out="$RELEASES_DIR/$VERSION/linux"
  mkdir -p "$out"
  cp "$BUNDLE_BASE/appimage/"*.AppImage "$out/" 2>/dev/null || true
  cp "$BUNDLE_BASE/deb/"*.deb "$out/" 2>/dev/null || true
  echo "$out"
}

# 构建 Android
build_android() {
  cd "$PROJECT_ROOT"
  npx tauri android build --release
  local out="$RELEASES_DIR/$VERSION/android"
  mkdir -p "$out"
  # Tauri 2 常见输出在 android/app/build/outputs
  local apk_dir="$TAURI_DIR/gen/android/app/build/outputs/apk/release"
  if [[ -d "$apk_dir" ]]; then
    cp "$apk_dir/"*.apk "$out/" 2>/dev/null || true
  fi
  echo "$out"
}

# 构建 iOS（需在 macOS 上且已配置 Xcode）
build_ios() {
  cd "$PROJECT_ROOT"
  npx tauri ios build --release
  local out="$RELEASES_DIR/$VERSION/ios"
  mkdir -p "$out"
  # iOS 产物通常在 Xcode 输出目录
  local xc_out="$TAURI_DIR/gen/ios/build/Build/Products/Release-iphoneos"
  if [[ -d "$xc_out" ]]; then
    cp -R "$xc_out/"* "$out/" 2>/dev/null || true
  fi
  echo "$out"
}

# 主流程
main() {
  local version=""
  local platform=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -v|--version)
        version="$2"
        shift 2
        ;;
      -h|--history)
        show_history
        exit 0
        ;;
      --help|-\?)
        show_help
        exit 0
        ;;
      --list-platforms)
        list_platforms
        exit 0
        ;;
      macos|windows|linux|android|ios)
        platform="$1"
        shift
        ;;
      *)
        echo "Unknown option or platform: $1"
        show_help
        exit 1
        ;;
    esac
  done

  if [[ -z "$platform" ]]; then
    show_help
    exit 1
  fi

  if [[ -n "$version" ]]; then
    update_version "$version"
  fi
  VERSION="$(get_current_version)"
  echo "Building $platform for version $VERSION ..."

  local out_path=""
  local success=false
  set +e
  case "$platform" in
    macos)   out_path="$(build_macos)"   ;;
    windows) out_path="$(build_windows)" ;;
    linux)   out_path="$(build_linux)"   ;;
    android) out_path="$(build_android)" ;;
    ios)     out_path="$(build_ios)"     ;;
    *) echo "Unsupported platform: $platform"; exit 1 ;;
  esac
  local build_exit=$?
  set -e
  [[ $build_exit -eq 0 ]] && success=true

  record_build "$VERSION" "$platform" "$success" "$out_path"
  if $success; then
    echo "Build finished. Output: $out_path"
  else
    echo "Build failed (recorded in history)."
    exit 1
  fi
}

main "$@"
