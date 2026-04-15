import { randomUUID } from "node:crypto";
import {
  createAgenticClient,
  wrapSpawnForClaudeCode,
  wrapSpawnForDeepSeek,
} from "@agentic/jsbridge";
import { loadMonorepoDotenv } from "@agentic/shared/node-env";

loadMonorepoDotenv(import.meta.url);

const baseUrl = process.env.AGENTIC_BASE_URL ?? "http://127.0.0.1:8787";
const token = process.env.AGENTIC_SERVER_TOKEN ?? "123456";

async function fakeAgentLoop(
  label: string,
  agentId: string,
  provider: string,
  runId: string,
): Promise<void> {
  const client = createAgenticClient({
    baseUrl,
    token,
    agentId,
    provider,
    flushIntervalMs: 200,
  });

  client.emitMeta(runId, { action: "run_start", label });

  for (let i = 0; i < 3; i += 1) {
    client.emitLlm(runId, {
      model: `${provider}-demo`,
      inputSummary: `turn ${i} prompt for ${label}`,
      outputSummary: `turn ${i} completion`,
    });
    client.emitCli(runId, {
      argv: ["echo", `step-${i}`],
      cwd: process.cwd(),
      exitCode: 0,
      stdoutSummary: `step-${i}\n`,
    });
    await new Promise((r) => setTimeout(r, 150));
  }

  client.emitMeta(runId, { action: "run_end", label });
  await client.shutdown();
}

async function subprocessSmoke(): Promise<void> {
  const runId = randomUUID();
  const ds = createAgenticClient({
    baseUrl,
    token,
    agentId: "subproc-deepseek",
    provider: "deepseek",
  });
  const cc = createAgenticClient({
    baseUrl,
    token,
    agentId: "subproc-claude-code",
    provider: "claude-code",
  });

  const node = process.execPath;
  const p1 = wrapSpawnForDeepSeek(
    { client: ds, runId },
    { command: node, args: ["-e", 'console.log("deepseek-wrap")'] },
  );
  const p2 = wrapSpawnForClaudeCode(
    { client: cc, runId },
    { command: node, args: ["-e", 'console.log("claude-wrap")'] },
  );

  await Promise.all([
    new Promise<void>((resolve) => p1.on("close", () => resolve())),
    new Promise<void>((resolve) => p2.on("close", () => resolve())),
  ]);

  await ds.shutdown();
  await cc.shutdown();
}

async function main(): Promise<void> {
  if (!token) {
    console.error("请设置 AGENTIC_SERVER_TOKEN 与已启动的 server 一致");
    process.exitCode = 1;
    return;
  }

  const runId = randomUUID();
  console.log(`[example] runId=${runId}`);

  await Promise.all([
    fakeAgentLoop("worker-a", "agent-a", "deepseek", runId),
    fakeAgentLoop("worker-b", "agent-b", "claude-code", runId),
  ]);

  await subprocessSmoke();

  console.log("[example] 完成：多 agent 伪造事件 + 子进程包装已上报");
}

void main();
