import { z } from "zod";

export const eventKindSchema = z.enum(["cli", "llm", "meta"]);

/**
 * 事件 payload 仍为 `Record<string, unknown>` 校验；以下为上报端可选用类型，
 * 便于在观测里串联 trace，不强制 ingest 必须携带。
 */
export type AgenticPayloadTrace = {
  traceId?: string;
  parentSeq?: number;
  parentSpanId?: string;
};

export const agenticEventSchema = z.object({
  runId: z.string().min(1),
  agentId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  provider: z.string().min(1),
  kind: eventKindSchema,
  ts: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export const ingestBatchBodySchema = z.object({
  events: z.array(agenticEventSchema).min(1).max(500),
});

export const sessionProviderIdSchema = z.enum(["cursor", "claude"]);

export const sessionsSyncBodySchema = z.object({
  provider: sessionProviderIdSchema.default("cursor"),
  projectName: z.string().optional(),
  transcriptsDir: z.string().optional(),
});

export const sessionsSyncToRunsBodySchema = z.object({
  sessionIds: z.array(z.number().int().positive()).min(1).max(200),
  granularity: z.enum(["section"]).default("section"),
});

export const sessionsSyncToRunsResponseSchema = z.object({
  ok: z.literal(true),
  runId: z.string().min(1),
  inserted: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  sessionsProcessed: z.number().int().nonnegative(),
  eventsGenerated: z.number().int().nonnegative(),
});

export type AgenticEvent = z.infer<typeof agenticEventSchema>;
export type IngestBatchBody = z.infer<typeof ingestBatchBodySchema>;
export type EventKind = z.infer<typeof eventKindSchema>;
export type SessionProviderId = z.infer<typeof sessionProviderIdSchema>;
export type SessionsSyncBody = z.infer<typeof sessionsSyncBodySchema>;
export type SessionsSyncToRunsBody = z.infer<typeof sessionsSyncToRunsBodySchema>;
export type SessionsSyncToRunsResponse = z.infer<typeof sessionsSyncToRunsResponseSchema>;
