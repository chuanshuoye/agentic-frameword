import { apiPaths, type AgenticEvent } from "@agentic/shared";
import { nextSeqFor } from "./seq.js";

export type AgenticClientConfig = {
  baseUrl: string;
  token: string;
  agentId: string;
  provider: string;
  maxPayloadBytes?: number;
  maxRetries?: number;
  flushIntervalMs?: number;
};

function trimPayload(
  payload: Record<string, unknown>,
  maxPayloadBytes: number,
): Record<string, unknown> {
  const raw = JSON.stringify(payload);
  if (raw.length <= maxPayloadBytes) {
    return payload;
  }
  return {
    _truncated: true,
    originalLength: raw.length,
    preview: raw.slice(0, maxPayloadBytes),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type AgenticClient = {
  readonly agentId: string;
  readonly provider: string;
  emitCli: (runId: string, payload: Record<string, unknown>) => void;
  emitLlm: (runId: string, payload: Record<string, unknown>) => void;
  emitMeta: (runId: string, payload: Record<string, unknown>) => void;
  enqueue: (runId: string, kind: AgenticEvent["kind"], payload: Record<string, unknown>) => void;
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
};

export function createAgenticClient(config: AgenticClientConfig): AgenticClient {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const maxPayloadBytes = config.maxPayloadBytes ?? 32_000;
  const maxRetries = config.maxRetries ?? 5;
  const flushIntervalMs = config.flushIntervalMs ?? 400;

  const queue: AgenticEvent[] = [];
  let flushTimer: ReturnType<typeof setInterval> | undefined;
  let flushPromise: Promise<void> = Promise.resolve();
  let closed = false;

  const url = `${baseUrl}${apiPaths.ingestBatch}`;

  function buildEvent(
    runId: string,
    kind: AgenticEvent["kind"],
    payload: Record<string, unknown>,
  ): AgenticEvent {
    const seq = nextSeqFor(runId, config.agentId);
    const ts = new Date().toISOString();
    return {
      runId,
      agentId: config.agentId,
      seq,
      provider: config.provider,
      kind,
      ts,
      payload: trimPayload(payload, maxPayloadBytes),
    };
  }

  async function postBatch(events: AgenticEvent[]): Promise<void> {
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt += 1;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.token}`,
          },
          body: JSON.stringify({ events }),
        });
        if (res.status === 401 || res.status === 400) {
          return;
        }
        if (!res.ok) {
          throw new Error(`ingest_http_${res.status}`);
        }
        return;
      } catch {
        const backoff = Math.min(10_000, 200 * 2 ** (attempt - 1));
        await sleep(backoff);
      }
    }
  }

  async function drainOnce(): Promise<void> {
    if (queue.length === 0) {
      return;
    }
    const batch = queue.splice(0, 200);
    await postBatch(batch);
  }

  function scheduleFlushChain(): void {
    flushPromise = flushPromise
      .then(async () => {
        await drainOnce();
        if (queue.length > 0) {
          scheduleFlushChain();
        }
      })
      .catch(() => {});
  }

  function enqueueEvent(ev: AgenticEvent): void {
    if (closed) {
      return;
    }
    queue.push(ev);
    scheduleFlushChain();
  }

  flushTimer = setInterval(() => {
    void flushPromise.then(() => drainOnce());
  }, flushIntervalMs);

  return {
    agentId: config.agentId,
    provider: config.provider,
    emitCli(runId, payload) {
      enqueueEvent(buildEvent(runId, "cli", payload));
    },
    emitLlm(runId, payload) {
      enqueueEvent(buildEvent(runId, "llm", payload));
    },
    emitMeta(runId, payload) {
      enqueueEvent(buildEvent(runId, "meta", payload));
    },
    enqueue(runId, kind, payload) {
      enqueueEvent(buildEvent(runId, kind, payload));
    },
    async flush() {
      await flushPromise;
      while (queue.length > 0) {
        await drainOnce();
      }
    },
    async shutdown() {
      closed = true;
      if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = undefined;
      }
      await flushPromise;
      while (queue.length > 0) {
        await drainOnce();
      }
    },
  };
}
