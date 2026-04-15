# 扩展 Provider

从业务侧接入客户端与子进程包装的步骤见 [jsbridge 接入](./jsbridge-integration.md)。

新增或替换某种「coding 模型 / CLI」场景的采集逻辑时，优先在 **`packages/jsbridge/src/providers/`** 下实现或调整包装函数。

## 原则

- 上报的 JSON 必须符合 **`@agentic/shared`** 中定义的事件与 ingest 协议（与现有 `AgenticEvent` 等类型一致）。
- 只要协议不变，**无需修改 Server 表结构**；服务端按统一事件模型存储与查询。

## 现有参考

- DeepSeek、Claude Code 的包装实现已存在于同目录，可作为子进程拦截与事件组装的参考。
- 客户端入口与导出见 `packages/jsbridge/src/index.ts`（如 `createAgenticClient`、`wrapSpawnForDeepSeek`、`wrapSpawnForClaudeCode`）。

后续若接入官方 hook 或 SDK，可在同一层适配并仍走统一的 `AgenticClient` 上报路径。
