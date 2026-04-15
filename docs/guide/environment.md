# 环境变量

在 **monorepo 根目录** 维护 `.env`（与从哪个子包启动无关）。模板为同目录下的 `.env.example`，首次可执行 `cp .env.example .env` 后按需修改。

下文按 **`.env.example` 中出现的变量** 完整说明；末尾补充 **代码支持但模板未列出** 的可选变量。

---

## 核心：鉴权与 API 根地址

| 变量 | 作用 | 读取方 | 默认 / 说明 |
|------|------|--------|-------------|
| `AGENTIC_SERVER_TOKEN` | 受保护 HTTP 接口的 Bearer 密钥（如 `POST /v1/ingest/batch`、多数 `/v1/skills/*`、`POST /v1/sessions/*` 等） | Server、Example（`demo.ts`） | 未设置时源码回退 `123456`（仅本地）；**若设为空白字符串**，鉴权中间件视为未配置，受保护路由会 **503** |
| `AGENTIC_BASE_URL` | API 根 URL，**不要**尾部 `/` | Example、UI 构建（经 Vite 定义注入） | `http://127.0.0.1:8787` |

---

## UI（Vite 注入，写在根 `.env`）

构建/开发 UI 时，`packages/ui/vite.config.ts` 会从 **进程环境** 读取根目录 `.env`（与 `AGENTIC_BASE_URL` 合并逻辑一致）。

| 变量 | 作用 | 读取方 | 默认 / 说明 |
|------|------|--------|-------------|
| `VITE_AGENTIC_SERVER_TOKEN` | 浏览器侧请求需鉴权接口时携带的 Bearer，应与 `AGENTIC_SERVER_TOKEN` **一致** | `packages/ui`（`api.ts`、各 Skill 页等） | 未设时回退尝试同文件中的 `AGENTIC_SERVER_TOKEN`（由 Vite `define` 注入）；**勿把真实密钥提交到公开仓库** |
| `VITE_DOCS_URL` | 文档站链接（如侧栏/入口跳转） | `packages/ui/src/App.tsx` | 未设时 `http://localhost:5174/` |
| `VITE_SKILL_PROBLEM_TYPES` | Skill 人工反馈等问题类型下拉选项，**英文逗号分隔** | `packages/ui/src/pages/SkillFeedbackPage.tsx` | 模板示例：`instruction_clarity,missing_prerequisites,unsafe_command,output_quality,other_custom` |

**API 基址注入优先级（UI）：** `AGENTIC_BASE_URL` → `VITE_API_BASE` → `http://127.0.0.1:8787`。`VITE_API_BASE` 未在 `.env.example` 中列出，但若单独使用 Vite 约定可在根 `.env` 增加。

---

## Server 运行时（`.env.example` 中注释项，建议了解）

| 变量 | 作用 | 默认 |
|------|------|------|
| `AGENTIC_PORT` | HTTP 监听端口 | `8787` |
| `AGENTIC_DB_PATH` | SQLite 数据库文件绝对或相对路径 | `packages/server/data/agentic.db`（相对 server 包） |

---

## Skill 生成 / Plan：大模型（OpenAI 兼容 Chat Completions）

与 `POST /v1/runs/:runId/skill/generate`、`POST /v1/runs/:runId/skill/plan` 等链路相关，由 `packages/server/src/skill/env.ts` 解析。

| 变量 | 作用 | 默认 |
|------|------|------|
| `AGENTIC_SKILL_LLM_BASE_URL` | 兼容 OpenAI 的 API 根（是否带 `/v1` 以你使用的厂商为准；代码会规范化尾部 `/`） | `https://api.deepseek.com` |
| `AGENTIC_SKILL_LLM_API_KEY` | 上述服务的 Bearer Key | 空；未配置且请求体也未带 `apiKey` 时，生成类接口会 **503** |
| `AGENTIC_SKILL_LLM_MODEL` | 模型名 | `deepseek-chat` |

`.env.example` 内注释了 DeepSeek、Moonshot 等示例，可按厂商替换 **`BASE_URL` + `MODEL` + `API_KEY`** 三套对齐。

### Plan 专用覆盖（可选）

若希望 **Plan** 与 **Generate** 使用不同模型或 Key，可单独设置；**任一未填则回退到 `AGENTIC_SKILL_LLM_*`**。

| 变量 | 作用 |
|------|------|
| `AGENTIC_SKILL_PLAN_LLM_BASE_URL` | Plan 请求的 API 根 |
| `AGENTIC_SKILL_PLAN_LLM_API_KEY` | Plan 请求的 Key |
| `AGENTIC_SKILL_PLAN_LLM_MODEL` | Plan 请求的模型 |

---

## 会话蒸馏：大模型（可选独立配置）

用于 `POST /v1/sessions/distill`；**未设置时回退到 `AGENTIC_SKILL_LLM_*`**。

| 变量 | 作用 |
|------|------|
| `AGENTIC_SESSION_DISTILL_LLM_BASE_URL` | 蒸馏调用 API 根 |
| `AGENTIC_SESSION_DISTILL_LLM_API_KEY` | 蒸馏调用 Key |
| `AGENTIC_SESSION_DISTILL_LLM_MODEL` | 蒸馏所用模型 |

---

## 代码支持、`.env.example` 未列出（可选）

| 变量 | 作用 | 默认 |
|------|------|------|
| `AGENTIC_LOG_DIR` | HTTP/LLM 等 API 日志目录 | 仓库根下 `logs` |
| `AGENTIC_CURSOR_PROJECTS_ROOT` | 本机 Cursor `projects` 根路径，用于按 `projectName` 解析 transcript | `~/.cursor/projects` |
| `AGENTIC_CURSOR_TRANSCRIPTS_DIR` | 直接指定 Cursor `agent-transcripts` 目录；设置后 Server 启动时可做一次性同步 | 未设置 |
| `AGENTIC_CLAUDE_TRANSCRIPTS_DIR` | Claude 侧 transcripts 根（一期占位/扩展） | 未设置时用 `CLAUDE_CONFIG_DIR/projects`，否则 `~/.claude/projects` |
| `CLAUDE_CONFIG_DIR` | 与 Claude CLI 配置目录联动，用于推导 projects 路径 | 无 |

会话同步、列表等详见 [HTTP API](./api.md) 与 [Agent 会话](./agent-sessions.md)。

---

## 安全提示

- **密钥**：`AGENTIC_SERVER_TOKEN`、`AGENTIC_SKILL_LLM_API_KEY`、`VITE_AGENTIC_SERVER_TOKEN` 等勿提交版本库；生产使用强随机 Token。
- **请求体 `apiKey`**：Skill 相关接口允许单次请求传入 `apiKey` 做本地调试；服务端不应将其持久化（以当前实现为准，仅作临时覆盖）。
