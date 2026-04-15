export { createAgenticClient, type AgenticClient, type AgenticClientConfig } from "./client.js";
export { wrapSpawnForDeepSeek } from "./providers/deepseek.js";
export { wrapSpawnForClaudeCode } from "./providers/claude-code.js";
export type { ProviderContext, SpawnWrapOptions } from "./providers/types.js";
