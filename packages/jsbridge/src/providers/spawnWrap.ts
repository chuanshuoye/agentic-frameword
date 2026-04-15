import { spawn, type ChildProcess } from "node:child_process";
import type { ProviderContext, SpawnWrapOptions } from "./types.js";

const defaultMaxCapture = 8000;

/**
 * 子进程包装：采集 argv/cwd/stdio 摘要并上报 CLI 快照（多 provider 共用）。
 */
export function wrapSpawnWithStdioCapture(
  providerId: string,
  ctx: ProviderContext,
  opts: SpawnWrapOptions,
  handlers?: { onStdout?: (chunk: string) => void; onStderr?: (chunk: string) => void },
  maxCapture: number = defaultMaxCapture,
): ChildProcess {
  let stdoutBuf = "";
  let stderrBuf = "";

  ctx.client.emitMeta(ctx.runId, {
    action: "spawn_wrap",
    provider: providerId,
    command: opts.command,
    args: opts.args,
    cwd: opts.cwd ?? process.cwd(),
  });

  const child = spawn(opts.command, opts.args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (d: Buffer) => {
    const s = d.toString("utf8");
    stdoutBuf = (stdoutBuf + s).slice(-maxCapture);
    handlers?.onStdout?.(s);
  });
  child.stderr?.on("data", (d: Buffer) => {
    const s = d.toString("utf8");
    stderrBuf = (stderrBuf + s).slice(-maxCapture);
    handlers?.onStderr?.(s);
  });

  child.on("close", (code, signal) => {
    ctx.client.emitCli(ctx.runId, {
      argv: [opts.command, ...opts.args],
      cwd: opts.cwd ?? process.cwd(),
      exitCode: code,
      signal: signal ?? undefined,
      stdoutSummary: stdoutBuf,
      stderrSummary: stderrBuf,
      provider: providerId,
    });
  });

  return child;
}
