import type { ChildProcess } from "node:child_process";
import type { ProviderContext, SpawnWrapOptions } from "./types.js";
import { wrapSpawnWithStdioCapture } from "./spawnWrap.js";

const providerId = "claude-code";

/**
 * Claude Code 场景：一期通过子进程包装采集 CLI 与 stdio 摘要。
 * 若后续接入官方插件 hook，仅替换本文件内部采集逻辑。
 */
export function wrapSpawnForClaudeCode(
  ctx: ProviderContext,
  opts: SpawnWrapOptions,
  handlers?: { onStdout?: (chunk: string) => void; onStderr?: (chunk: string) => void },
): ChildProcess {
  return wrapSpawnWithStdioCapture(providerId, ctx, opts, handlers);
}
