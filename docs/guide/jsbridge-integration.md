# jsbridge 接入步骤

`@agentic/jsbridge` 提供 **HTTP 上报客户端**（`createAgenticClient`）与 **DeepSeek / Claude Code 场景的子进程包装**（`wrapSpawnForDeepSeek`、`wrapSpawnForClaudeCode`）。事件形状需符合 `@agentic/shared`（ingest 批量接口）。

## 1. 安装与构建

在 monorepo 内其他包中声明依赖：

```json
"dependencies": {
  "@agentic/jsbridge": "*"
}
```

根目录执行 `npm install`。若单独发布 npm 包后再引用，则使用对应版本号。

运行或打包你的应用前，需已构建 jsbridge（及 shared）：在仓库根执行 `npm run build`，或至少 `npm run build -w @agentic/shared && npm run build -w @agentic/jsbridge`。

## 2. 环境变量

与 Server 约定一致（通常写在 **仓库根** `.env`）：

- `AGENTIC_BASE_URL`：API 根 URL，无尾部 `/`，默认可视为 `http://127.0.0.1:8787`。
- `AGENTIC_SERVER_TOKEN`：`POST .../ingest/batch` 的 Bearer token；勿提交到版本库。

你的进程需自行加载 `.env`（示例见 `apps/example/src/demo.ts` 中对 `loadMonorepoDotenv` 的调用）。

## 3. 创建客户端

```ts
import { createAgenticClient } from "@agentic/jsbridge";

const client = createAgenticClient({
  baseUrl: process.env.AGENTIC_BASE_URL ?? "http://127.0.0.1:8787",
  token: process.env.AGENTIC_SERVER_TOKEN ?? "",
  agentId: "my-agent-1",   // 多 agent 时区分实例
  provider: "deepseek",    // 或 claude-code、自定义标识，与协议一致即可
  flushIntervalMs: 400,    // 可选，定时尝试刷队列
  maxPayloadBytes: 32_000, // 可选，单条 payload JSON 超限会截断摘要
  maxRetries: 5,           // 可选，ingest 失败退避重试次数
});
```

一次 **Run** 使用同一个 `runId`（字符串，建议 UUID）；同一 Run 下多 agent 用不同 `agentId` 的多个 client 即可。

## 4. 上报事件

在已知 `runId` 后调用（payload 为普通对象，会写入事件的 `payload` 字段）：

- `client.emitMeta(runId, { ... })` — 元信息、阶段标记等。
- `client.emitLlm(runId, { ... })` — 模型调用摘要（如 model、inputSummary、outputSummary）。
- `client.emitCli(runId, { ... })` — 命令行相关（如 argv、cwd、exitCode、stdoutSummary）。

需要直接指定 kind 时可用 `client.enqueue(runId, kind, payload)`（`kind` 类型来自 shared 的 `AgenticEvent`）。

客户端内部会分配单调 `seq`、补 `ts`，并 **异步批量** `POST` 到 ingest；进程退出前务必：

```ts
await client.shutdown();
```

`shutdown` 会停止定时 flush、排空队列。短脚本也可在关键点 `await client.flush()`。

## 5. 子进程包装（DeepSeek / Claude Code）

在已有 `client` 与 `runId` 的前提下，用包装函数启动子进程，自动上报 `spawn_wrap`（meta）及结束时的 `emitCli`（含 stdio 尾部摘要）：

```ts
import {
  wrapSpawnForDeepSeek,
  wrapSpawnForClaudeCode,
} from "@agentic/jsbridge";

const ctx = { client, runId };

const child = wrapSpawnForDeepSeek(
  ctx,
  { command: "node", args: ["script.js"], cwd: process.cwd() },
  { onStdout: (chunk) => { /* 可选 */ }, onStderr: (chunk) => { /* 可选 */ } },
);
```

`wrapSpawnForClaudeCode` 用法相同，仅内部 `provider` 标识不同。返回值为 Node `ChildProcess`，可按需监听 `close` / `error`。

## 6. 与 Server 联调

1. 启动 Server，确认 `AGENTIC_SERVER_TOKEN` 非空且与 client 一致。  
2. 运行你的脚本或 `npm run start:example`。  
3. 用 UI 或 `GET /v1/runs`、`GET /v1/runs/:runId/events` 查看事件。

自定义采集逻辑时保持 **envelope** 与 shared 一致即可；扩展方式见 [扩展 Provider](./extending.md)。
