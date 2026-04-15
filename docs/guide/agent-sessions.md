# Agent 会话

Agent 会话模块用于管理和利用来自 Cursor/Agent 的历史会话数据。它和 run 事件互补：

- **run** 偏执行时序（CLI/LLM/meta）
- **session** 偏对话与过程沉淀（可检索、可蒸馏、可回放）

## 核心概念

- **Session**：一条完整会话记录，包含项目、Agent、时间、内容等信息。
- **Session 同步**：从外部 transcript（如 Cursor 项目）导入到本地库。
- **Session 蒸馏**：把会话整理为结构化 JSONL，用于训练/分析/归档。
- **Session 转 Run**：把会话转为统一事件模型，接入现有 run 时间线和 Skill 生成链路。

## 模块能力

### 1) 检索与查看

- `GET /v1/sessions`：支持 `limit`、`offset`、`q`、`projectKey`、`agentId`。
- `GET /v1/sessions/:id`：查看单条会话详情。
- `GET /v1/sessions/cursor-projects`：列出可同步的 Cursor 项目（支持 `projectName` 过滤）。

### 2) 同步导入

- `POST /v1/sessions/sync`
- 支持通过 `transcriptsDir` 直接指定目录，或用 `projectName` 按项目解析路径。
- 导入后可获得扫描/新增/更新/跳过统计，便于审计同步效果。

### 3) 蒸馏导出

- `POST /v1/sessions/distill`
- 将会话转为规范化 JSONL，适合后续做评测样本、知识沉淀或离线分析。

### 4) 会话转运行轨迹

- `POST /v1/sessions/sync-to-runs`
- 把会话批量映射为标准事件并写入 run/event 存储，打通 run 生态（SSE、Skill 生成、UI 时间线）。

### 5) 批量治理

- `POST /v1/sessions/batch-delete`：按 id 集合清理历史会话。

## 为什么需要 Agent 会话模块

- **补齐上下文**：仅靠执行事件可能缺少人机意图，session 能补充“为什么这么做”。
- **统一数据平面**：通过 sync-to-runs，把会话资产转为统一事件模型，避免两套孤立链路。
- **支持长期演进**：会话可检索、可蒸馏、可重放，是 Skill 优化与质量复盘的重要输入。

## 典型使用流程

1. 同步会话：`POST /v1/sessions/sync`
2. 过滤检索：`GET /v1/sessions?q=...&projectKey=...`
3. 选会话转 run：`POST /v1/sessions/sync-to-runs`
4. 在 run 维度继续做：事件回放、Harness Skill 生成、治理发布

## 与其他模块关系

- 与 `jsbridge`：jsbridge 提供实时事件；session 提供历史会话，二者可在 run 维度汇合。
- 与 `Harness Skill 生成`：session 转 run 后可直接进入 Skill 生成流程。
- 与 `HTTP API`：接口总览见 [HTTP API](./api.md)。
