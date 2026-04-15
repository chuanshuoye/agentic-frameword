import type { ChildProcess } from "node:child_process";
import type { ProviderContext, SpawnWrapOptions } from "./types.js";
import { wrapSpawnWithStdioCapture } from "./spawnWrap.js";

const providerId = "deepseek";

/**
 * DeepSeek 场景：一期通过子进程包装采集 argv/cwd/stdio 摘要。
 * 若后续存在官方可观测接口，可在此文件替换实现，无需改 server 协议。
 */
export function wrapSpawnForDeepSeek(
  ctx: ProviderContext,
  opts: SpawnWrapOptions,
  handlers?: { onStdout?: (chunk: string) => void; onStderr?: (chunk: string) => void },
): ChildProcess {
  return wrapSpawnWithStdioCapture(providerId, ctx, opts, handlers);
}
