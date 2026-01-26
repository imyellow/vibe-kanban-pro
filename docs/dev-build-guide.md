# 开发与构建指南（本地）

## 开发
- 安装依赖：`pnpm i`
- 启动前端 + 后端（推荐 QA 模式）：`pnpm run dev:qa`
  - 自动分配 `FRONTEND_PORT` 和 `BACKEND_PORT`
  - 查看终端日志获取分配的端口号
  - 开发网页：`http://localhost:<FRONTEND_PORT>`
  - 后端 API：`http://localhost:<BACKEND_PORT>`
- 如果 QA 脚本不可用，使用：`pnpm run dev`

仅前端（开发网页）：
- `pnpm -C frontend run dev -- --port 3000 --host`
- 访问：`http://localhost:3000`

## 构建与预览
- 为生产环境构建前端：`pnpm -C frontend run build`
  - 输出目录：`frontend/dist`
- 在本地运行构建后的网页：
  - `pnpm -C frontend run preview -- --host --port 4173`
  - 访问：`http://localhost:4173`
  - 替代方案：`npx serve frontend/dist -l 4173`
- 用一条命令同时运行构建后的前端和后端（由后端托管前端静态资源）：
  - `FRONTEND_PORT=1234 && pnpm -C frontend run build && BACKEND_PORT=1235 cargo run --bin server`
  - 访问：`http://localhost:1234`

后端（如果需要访问 API）：
- `cargo run --bin server`（本地）
- 或 `pnpm run backend:dev:watch`（开发模式）

## 数据库位置
- 开发（调试）：`dev_assets/db.sqlite`
- 发布版本（按操作系统数据目录）：
  - macOS：`~/Library/Application Support/vibe-kanban/db.sqlite`
  - Linux：`~/.local/share/vibe-kanban/db.sqlite`
  - Windows：`%APPDATA%\\vibe-kanban\\db.sqlite`
