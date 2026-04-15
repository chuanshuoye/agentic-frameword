import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openDb } from "./db.js";
import { ingestEvents, listRuns } from "./store.js";

describe("store ingestEvents", () => {
  it("inserts events and lists runs", () => {
    const db: Database.Database = openDb(":memory:");
    const events = [
      {
        runId: "run-a",
        agentId: "agent-a",
        seq: 0,
        provider: "test",
        kind: "meta" as const,
        ts: "2026-04-01T12:00:00.000Z",
        payload: { step: 1 },
      },
    ];
    const result = ingestEvents(db, events);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);
    const runs = listRuns(db, 10);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.runId).toBe("run-a");
    expect(runs[0]?.eventCount).toBe(1);
  });

  it("skips duplicate seq for same run and agent", () => {
    const db: Database.Database = openDb(":memory:");
    const ev = {
      runId: "run-b",
      agentId: "agent-b",
      seq: 0,
      provider: "test",
      kind: "cli" as const,
      ts: "2026-04-01T12:00:00.000Z",
      payload: {},
    };
    expect(ingestEvents(db, [ev])).toEqual({ inserted: 1, skipped: 0 });
    expect(ingestEvents(db, [ev])).toEqual({ inserted: 0, skipped: 1 });
  });
});
