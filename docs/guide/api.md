# HTTP API

路径前缀与常量统一定义在 `@agentic/shared` 的 `API_PREFIX`、`apiPaths`。

## 鉴权说明

- 无需鉴权：`/health`、`GET /v1/runs`、`GET /v1/runs/:runId`、`GET /v1/runs/:runId/events`、`GET /v1/events/stream`、`GET /v1/sessions`、`GET /v1/sessions/:id`、`GET /v1/sessions/cursor-projects`
- 其余接口均需：`Authorization: Bearer <AGENTIC_SERVER_TOKEN>`

## Health 与 Ingest

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `POST` | `/v1/ingest/batch` | 批量写入事件，Body: `{ events: AgenticEvent[] }` |

## Runs

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/v1/runs` | Run 列表，支持 `limit`（最大 200） |
| `GET` | `/v1/runs/:runId` | Run 详情 |
| `GET` | `/v1/runs/:runId/events` | Run 事件，支持 `sinceSeq`、`agentId` |
| `GET` | `/v1/events/stream` | SSE 事件流，必填 `runId`，可选 `sinceSeq`、`agentId` |
| `POST` | `/v1/runs/:runId/skill/plan` | 基于 Run 事件提炼 userGoal；成功时 **响应体为纯文本**（`text/plain`），非 JSON |
| `POST` | `/v1/runs/:runId/skill/generate` | 仅根据请求体 `userGoal` 生成 skill 草案（不读 events；路径中的 `runId` 仅兼容保留） |
| `POST` | `/v1/runs/:runId/reviews` | Harness 失败复盘：输出失败案例并可幂等写入根目录 `AGENT.md` |

### Skill Plan / Generate（二步）

- **`POST /v1/runs/:runId/skill/plan`**：读取该 run 的 events（支持 `agentIds`、`maxContextEvents`），调用内置 `skillGenerateAgent`（`@agentic/skill-agents`）；大模型与 HTTP 成功响应均为**纯文本**（无 JSON 包裹）。若有上下文预警，服务端会以可读前缀拼入正文。可选环境变量：`AGENTIC_SKILL_PLAN_LLM_BASE_URL`、`AGENTIC_SKILL_PLAN_LLM_API_KEY`、`AGENTIC_SKILL_PLAN_LLM_MODEL`（未设置时回退到 `AGENTIC_SKILL_LLM_*`）。失败时仍返回 JSON：`{ "error", "message" }`。
- **`POST /v1/runs/:runId/skill/generate`**：仅使用请求体中的 `userGoal`、`formats` 等调用模型；**不查询** events 表。请求体中的 `agentIds`、`maxContextEvents` 会被忽略（兼容旧客户端）。成功响应的 `generationMeta.contextPolicy` 为 `{ "source": "user_goal_only" }`。

### Harness Review / AGENT.md

- **`POST /v1/runs/:runId/reviews`**：
  - 请求体：`note?`、`agentIds?`、`maxContextEvents?`、`model?`、`apiKey?`、`mode?`（`dry_run` 或 `write_agent_md`）。
  - 响应体：`summary`、`cases[]`、`writeResult`（含 `path/updated/inserted/merged`）。
  - 当 `mode=write_agent_md`（默认）时，服务端会把失败案例按幂等键（`runId + failure_fingerprint`）合并写入仓库根目录 `AGENT.md`。

- **`AGENT.md`（OpenAI 风格）固定结构**：
  - `# Agent Knowledge Base`
  - `## Scope`
  - `## Operating Constraints`
  - `## Failure Cases`（自动维护分区）
  - `## Stable Playbooks`
  - `## Changelog`

## Sessions

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/v1/sessions` | 会话检索，支持 `limit`、`offset`、`q`、`projectKey`、`agentId` |
| `GET` | `/v1/sessions/:id` | 会话详情 |
| `GET` | `/v1/sessions/cursor-projects` | 列出 Cursor projects，支持 `projectName` 过滤 |
| `POST` | `/v1/sessions/sync` | 从 Cursor transcript 同步入库（`projectName`/`transcriptsDir`） |
| `POST` | `/v1/sessions/distill` | 会话蒸馏导出（JSONL） |
| `POST` | `/v1/sessions/sync-to-runs` | 将会话转换为 run/events |
| `POST` | `/v1/sessions/batch-delete` | 批量删除会话（`ids`） |

## Skills（基础）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/v1/skills` | 新建 skill 记录（支持 run 关联 + bundles） |
| `GET` | `/v1/skills` | skill 列表，支持 `limit`、`runId`、`format` |
| `GET` | `/v1/skills/:id` | skill 详情 |
| `PATCH` | `/v1/skills/:id` | 更新 skill 状态 |

## Skills（治理）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/v1/skills/:id/governance` | 治理明细（策略命中、门禁等） |
| `POST` | `/v1/skills/:id/review` | 人审决策（approved/rejected） |
| `POST` | `/v1/skills/:id/release` | 发布 skill（需门禁通过且 status 为 accepted） |

## Skills（演进与运行态）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/v1/skills/feedback` | 运行态反馈上报 |
| `POST` | `/v1/skills/runtime/match` | 运行时匹配候选 skill |
| `POST` | `/v1/skills/:id/experiments` | 创建实验 |
| `GET` | `/v1/skills/:id/experiments` | 查询实验列表 |
| `POST` | `/v1/skills/:id/evals` | 创建评测记录 |
| `GET` | `/v1/skills/:id/scorecard` | 获取评分卡 |
| `GET` | `/v1/skills/:id/feedback-trend` | 获取反馈趋势（支持 `windowDays`） |
| `POST` | `/v1/skills/:id/rollback` | 发起回滚 |

## Skills（人工反馈与版本）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/v1/skills/:id/human-feedback` | 提交人工反馈 |
| `GET` | `/v1/skills/:id/human-feedback` | 查询人工反馈（支持 `limit`） |
| `POST` | `/v1/skills/:id/regenerate-from-feedback` | 基于反馈生成新草稿版本 |
| `GET` | `/v1/skills/:id/versions` | 查询版本列表 |

## 事件结构

`runId`、`agentId`、`seq`、`provider`、`kind`、`ts`、`payload` 等字段以 `packages/shared/src/schema.ts` 的 schema/type 为准。
