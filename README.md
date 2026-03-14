# 文思 Wensi AI 写作工作台

Tauri 2 + React 桌面应用，本地 SQLite 存储文章、草稿、写作风格与对话，大模型支持手动配置（OpenAI 兼容接口）。

## 技术栈

- **前端**: React 19, Vite 6, Tailwind 4, Motion
- **桌面**: Tauri 2 (Rust)
- **存储**: 本地 SQLite（文章、草稿、草稿对话、用户设置、模型配置）
- **大模型**: 手动配置 API Key / Base URL / 模型名，兼容 OpenAI API

## 环境要求

- Node.js 18+
- Rust 1.70+（用于 Tauri）
- npm 或 pnpm

## 安装与运行

1. 安装依赖：`npm install`
2. 开发模式（仅前端）：`npm run dev`
3. 桌面应用开发：`npm run tauri dev`（会先启动 Vite，再打开 Tauri 窗口）
4. 打包桌面应用：`npm run tauri build`

## 数据与配置

- SQLite 数据库路径：由 Tauri 应用数据目录决定（如 macOS: `~/Library/Application Support/com.wensi.flow-desk/wensi.db`）
- 模型配置：在应用内侧栏「模型配置」中添加模型，填写 API Key、Base URL（可选）、模型名，点击卡片设为当前模型。支持任意 OpenAI 兼容接口（含 OpenAI、Azure、本地部署等）。

## 项目结构

- `src/`：React 前端（App、类型、常量、服务）
- `src-tauri/`：Rust 后端（SQLite、LLM 请求、Tauri 命令）
- 样式与交互保持原有页面风格不变。
