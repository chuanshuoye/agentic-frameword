import type { AgenticEvent, StoredEvent } from "@agentic/shared";

/** Plan 观测拼接：单条 payload 上限（UTF-16 近似按字符计），与条数相乘影响请求体积 */
const DEFAULT_MAX_BYTES_PER_PAYLOAD = 4096;

const SENSITIVE_KEYS = new Set(
  ["authorization", "apikey", "api_key", "password", "token", "secret", "bearer"],
);

function redactValue(key: string, value: unknown): unknown {
  if (typeof value === "string" && SENSITIVE_KEYS.has(key.toLowerCase())) {
    return "[REDACTED]";
  }
  return value;
}

function walkRedact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out[k] = walkRedact(v as Record<string, unknown>);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item, i) =>
        item !== null && typeof item === "object"
          ? walkRedact(item as Record<string, unknown>)
          : redactValue(`${k}[${i}]`, item),
      );
    } else {
      out[k] = redactValue(k, v);
    }
  }
  return out;
}

export function trimPayloadForContext(
  payload: Record<string, unknown>,
  maxPayloadBytes: number,
): Record<string, unknown> {
  const redacted = walkRedact(payload);
  const raw = JSON.stringify(redacted);
  if (raw.length <= maxPayloadBytes) {
    return redacted;
  }
  return {
    _truncated: true,
    originalLength: raw.length,
    preview: raw.slice(0, maxPayloadBytes),
  };
}

export function filterEventsByAgents(events: StoredEvent[], agentIds: string[] | undefined): StoredEvent[] {
  if (!agentIds || agentIds.length === 0) {
    return events;
  }
  const set = new Set(agentIds);
  return events.filter((e) => set.has(e.agentId));
}

/** 按 seq 升序，仅保留末尾至多 maxEvents 条（偏好像当前工作流） */
export function capEventsByTail(events: StoredEvent[], maxEvents: number): StoredEvent[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  if (sorted.length <= maxEvents) {
    return sorted;
  }
  return sorted.slice(sorted.length - maxEvents);
}

export function buildObservationContext(
  events: StoredEvent[],
  opts: { maxPayloadBytes?: number } = {},
): string {
  const maxPayloadBytes = opts.maxPayloadBytes ?? DEFAULT_MAX_BYTES_PER_PAYLOAD;
  const lines: string[] = [];
  for (const e of events) {
    const label = `[${e.seq}] ${e.ts} ${e.kind} ${e.agentId} ${e.provider}`;
    const payload = trimPayloadForContext(e.payload as Record<string, unknown>, maxPayloadBytes);
    lines.push(`${label}\n${JSON.stringify(payload)}`);
  }
  return lines.join("\n---\n");
}

export function summarizeKinds(events: StoredEvent[]): string {
  const counts = new Map<AgenticEvent["kind"], number>();
  for (const e of events) {
    counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([k, n]) => `${k}:${n}`)
    .join(", ");
}
