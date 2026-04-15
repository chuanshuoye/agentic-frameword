# Agentic Framework（一期）

面向 **agent 执行观测** 的 TypeScript monorepo：执行侧通过 **jsbridge** 批量上报 CLI / LLM / meta 快照，**API Server** 落库（SQLite），**UI** 查看 Run 与时间线；支持单 agent 与多 agent（`runId` + `agentId`）。

## 仓库结构


| 路径                  | 说明                                                     |
| ------------------- | ------------------------------------------------------ |
| `packages/shared`   | `@agentic/shared`：Zod 协议、`apiPaths`                    |
| `packages/server`   | `@agentic/server`：Hono + SQLite                        |
| `packages/jsbridge` | `@agentic/jsbridge`：上报客户端、DeepSeek / Claude Code 子进程包装 |
| `packages/ui`       | `@agentic/ui`：Vite + React 观测台                         |
| `apps/example`      | 端到端演示（伪造事件 + 子进程包装）                                    |


## 环境要求

- Node.js 18+（内置 `fetch`）
- npm（workspaces）

## 安装与构建

```bash
cp .env.example .env
# 编辑 .env：至少设置 AGENTIC_SERVER_TOKEN（与下文说明一致）

npm install
npm run build
```

`build` 按依赖顺序编译：`shared` → `jsbridge` → `server` → `ui`。

## 环境变量（仓库根目录 `.env`）

**Server、Example、UI 均从 monorepo 根目录读取 `.env`**（路径固定，与从哪一子包启动无关）。

### 常用（建议写入根 `.env`）


| 变量                     | 说明                                                             | 未设置时的行为                                       |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| `AGENTIC_SERVER_TOKEN` | `POST /v1/ingest/batch` 的 Bearer 密钥；为空字符串时 ingest 返回 503       | 源码回退为 `123456`（仅本地便利，**生产务必在 .env 中设为强随机密钥**） |
| `AGENTIC_BASE_URL`     | API 根地址，无尾部 `/`；Example 直连、Vite 构建/开发时注入给 UI 的 `VITE_API_BASE` | `http://127.0.0.1:8787`                       |


模板见根目录 `[.env.example](.env.example)`。

### 仅 Server（可写在同一 `.env`）


| 变量                           | 说明                                                                                                  | 默认                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------- |
| `AGENTIC_PORT`               | HTTP 端口                                                                                             | `8787`                            |
| `AGENTIC_DB_PATH`            | SQLite 文件路径                                                                                         | `packages/server/data/agentic.db` |
| `AGENTIC_SKILL_LLM_BASE_URL` | Skill 生成调用的 OpenAI 兼容 API 根路径；DeepSeek 建议 `https://api.deepseek.com`（服务端会固定走官方 `/chat/completions`） | `https://api.deepseek.com`        |
| `AGENTIC_SKILL_LLM_API_KEY`  | 上述接口的 Bearer Key；可与请求体 `apiKey` 二选一（请求优先）                                                           | 未设置且请求无 `apiKey` 时接口返回 503        |
| `AGENTIC_SKILL_LLM_MODEL`    | 默认模型名                                                                                               | `deepseek-chat`                   |


### UI 兼容

若仍需单独使用 Vite 约定变量，可在 `.env` 中设置 `VITE_API_BASE`；**优先级**为：`AGENTIC_BASE_URL` → `VITE_API_BASE` → 默认 `http://127.0.0.1:8787`。

Run 详情页的「生成 Cursor Skill」会调用 `POST /v1/runs/:runId/skill/generate`，需 Bearer：构建时会把根目录 `.env` 中的 `VITE_AGENTIC_SERVER_TOKEN` 或 `AGENTIC_SERVER_TOKEN` 注入为 `import.meta.env.VITE_AGENTIC_SERVER_TOKEN`（勿把生产密钥提交到仓库）。

## 本地运行

**1. 启动 API（开发热重载，需已 `npm run build` 过各包或至少 shared/jsbridge）**

```bash
npm run dev:server
```

生产形态可先 `npm run build`，再：

```bash
npm run start -w @agentic/server
```

**2. 启动 UI**

```bash
npm run dev:ui
```

浏览器访问终端提示的本地地址（默认 Vite `5173`）。API 地址来自根目录 `.env` 中的 `AGENTIC_BASE_URL`（或 `VITE_API_BASE`）。

**3. 注入演示数据（可选）**

```bash
npm run start:example
```

在 UI 的 Run 列表中应能看到新 Run 与多 `agentId` 事件。

## HTTP API（节选）

- `GET /health` — 健康检查  
- `POST /v1/ingest/batch` — Body：`{ "events": AgenticEvent[] }`，需 `Authorization: Bearer <token>`  
- `GET /v1/runs` — Run 列表，支持 `?limit=`  
- `GET /v1/runs/:runId` — Run 元信息  
- `GET /v1/runs/:runId/events` — 时间线；可选 `sinceSeq`、`agentId`  
- `POST /v1/runs/:runId/skill/generate` — 根据观测生成 Skill（可选 Cursor / Claude 范式）；需 Bearer；Body 见 `docs/guide/api.md`  
- `GET /v1/events/stream` — SSE；Query：`runId`，可选 `sinceSeq`、`agentId`

事件 envelope 字段见 `packages/shared/src/schema.ts`（`runId`、`agentId`、`seq`、`provider`、`kind`、`ts`、`payload`）。

## 根目录脚本


| 脚本                      | 作用          |
| ----------------------- | ----------- |
| `npm run build`         | 全量构建        |
| `npm run dev:server`    | 开发启动 Server |
| `npm run dev:ui`        | 开发启动 UI     |
| `npm run start:example` | 运行 example  |


## 扩展 Provider

在 `packages/jsbridge/src/providers/` 中新增或替换采集实现（如后续接入官方 hook），保持上报 JSON 与 `@agentic/shared` 协议一致即可，无需改 Server 表结构。

## 更多背景

产品目标与一期范围见仓库内 `[plan.md](plan.md)`。