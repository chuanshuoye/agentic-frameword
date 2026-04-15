import { describe, expect, it } from "vitest";
import { agenticEventSchema, ingestBatchBodySchema } from "./schema.js";

describe("ingestBatchBodySchema", () => {
  it("rejects empty events", () => {
    const r = ingestBatchBodySchema.safeParse({ events: [] });
    expect(r.success).toBe(false);
  });

  it("accepts a minimal valid batch", () => {
    const event = {
      runId: "run-1",
      agentId: "agent-1",
      seq: 0,
      provider: "demo",
      kind: "meta" as const,
      ts: "2026-01-01T00:00:00.000Z",
      payload: { hello: "world" },
    };
    expect(agenticEventSchema.safeParse(event).success).toBe(true);
    const r = ingestBatchBodySchema.safeParse({ events: [event] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.events).toHaveLength(1);
    }
  });
});
