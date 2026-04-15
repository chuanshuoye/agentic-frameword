# 示例应用（`apps/example`）

`@agentic/example` 用于在本地 **伪造多 agent 事件** 并演示 **子进程包装上报**，便于联调 Server 与 UI，无需真实接入 DeepSeek / Claude Code CLI。

## 位置与依赖

| 项 | 说明 |
|----|------|
| 目录 | `apps/example/` |
| 入口 | `src/demo.ts`（`npm run start` → `tsx src/demo.ts`） |
| 依赖 | `@agentic/jsbridge`、`@agentic/shared` |

环境变量从 **monorepo 根目录** 的 `.env` 加载：调用 `@agentic/shared/node-env` 的 `loadMonorepoDotenv(import.meta.url)`（与 Server 一致）。

## 运行前准备

1. 根目录已 `npm install`，并已构建 `shared`、`jsbridge`（全量 `npm run build` 即可）。
2. Server 已启动（`npm run dev:server`），且 `.env` 中 `AGENTIC_SERVER_TOKEN`、`AGENTIC_BASE_URL` 与示例一致。

```bash
npm run start:example
```

等价于 `npm run start -w @agentic/example`。

## 示例做了什么

1. **打印 `runId`**：后续在 UI 中可按该 Run 查看时间线。
2. **并发两个「假 agent」**（`fakeAgentLoop`）  
   - 共用同一 `runId`，`agentId` 分别为 `agent-a` / `agent-b`，`provider` 为 `deepseek` / `claude-code`。  
   - 各创建独立 `createAgenticClient`，调用 `emitMeta`（`run_start` / `run_end`）、`emitLlm`、`emitCli`，带 `flushIntervalMs: 200` 加快批量上报节奏。  
   - 结束前均 `await client.shutdown()`，保证队列刷盘。
3. **子进程烟测**（`subprocessSmoke`）  
   - 新 `runId`，两个 client（`subproc-deepseek` / `subproc-claude-code`）。  
   - 分别调用 `wrapSpawnForDeepSeek`、`wrapSpawnForClaudeCode` 启动短生命周期 Node 子进程；包装内会 `emitMeta`（`spawn_wrap`）并在进程结束时 `emitCli`（含 stdout/stderr 摘要）。  
   - 等待子进程 `close` 后 `shutdown` 两个 client。

完成后控制台输出类似：`[example] 完成：多 agent 伪造事件 + 子进程包装已上报`。

## 与真实接入的关系

本示例 **直接调用** `emitXxx` 与包装函数，展示最小集成路径。业务侧通常把同类调用挂到真实 CLI/Agent 生命周期上；分步说明见 [jsbridge 接入](./jsbridge-integration.md)。
