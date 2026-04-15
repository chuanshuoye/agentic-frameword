# 环境变量

所有说明均针对 **仓库根目录** 下的 `.env`。模板见根目录 `.env.example`。

## 常用（建议写入根 `.env`）

| 变量 | 说明 | 未设置时的行为 |
|------|------|----------------|
| `AGENTIC_SERVER_TOKEN` | `POST /v1/ingest/batch` 的 Bearer 密钥；为空字符串时 ingest 返回 503 | 源码回退为 `123456`（仅本地便利，**生产务必设为强随机密钥**） |
| `AGENTIC_BASE_URL` | API 根地址，无尾部 `/`；Example 直连、Vite 构建/开发时注入给 UI 的 `VITE_API_BASE` | `http://127.0.0.1:8787` |

## 仅 Server（可写在同一 `.env`）

| 变量 | 说明 | 默认 |
|------|------|------|
| `AGENTIC_PORT` | HTTP 端口 | `8787` |
| `AGENTIC_DB_PATH` | SQLite 文件路径 | `packages/server/data/agentic.db` |
| `AGENTIC_CURSOR_PROJECTS_ROOT` | Cursor 本地 projects 根目录 | `~/.cursor/projects` |
| `AGENTIC_CURSOR_TRANSCRIPTS_DIR` | Cursor 本地 `agent-transcripts` 覆盖目录（可选） | 未设置时可通过 `projectName` 在 `AGENTIC_CURSOR_PROJECTS_ROOT` 中匹配 |
| `AGENTIC_CLAUDE_TRANSCRIPTS_DIR` | Claude 本地 transcripts 根目录（一期仅预留） | `~/.claude/projects`（若设置 `CLAUDE_CONFIG_DIR` 建议改用 `$CLAUDE_CONFIG_DIR/projects`） |

## UI 与 API 地址

若单独使用 Vite 约定变量，可在 `.env` 中设置 `VITE_API_BASE`。

**优先级：** `AGENTIC_BASE_URL` → `VITE_API_BASE` → 默认 `http://127.0.0.1:8787`。
