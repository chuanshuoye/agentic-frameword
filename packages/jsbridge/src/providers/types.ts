import type { AgenticClient } from "../client.js";

/**
 * Provider 适配层扩展点：未来若 CLI 暴露官方 hook/telemetry，
 * 在对应 provider 内替换 wrapSpawn/attach 实现即可，上报 envelope 不变。
 */
export type ProviderContext = {
  client: AgenticClient;
  runId: string;
};

export type SpawnWrapOptions = {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};
