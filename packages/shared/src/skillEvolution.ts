import { z } from "zod";

export const experimentStatusSchema = z.enum(["draft", "running", "stopped", "completed"]);
export type ExperimentStatus = z.infer<typeof experimentStatusSchema>;

export const rollbackModeSchema = z.enum(["manual", "suggested", "auto"]);
export type RollbackMode = z.infer<typeof rollbackModeSchema>;

export const skillEvalRunCreateBodySchema = z.object({
  skillRecordId: z.number().int().positive(),
  dataset: z.string().min(1).max(128),
  score: z.number().min(0).max(100),
  verdict: z.enum(["pass", "warn", "fail"]),
  summary: z.string().max(2000).optional(),
});
export type SkillEvalRunCreateBody = z.infer<typeof skillEvalRunCreateBodySchema>;

export const skillRuntimeFeedbackCreateBodySchema = z.object({
  skillRecordId: z.number().int().positive(),
  runId: z.string().min(1).max(512).optional(),
  taskType: z.string().min(1).max(128),
  success: z.boolean(),
  latencyMs: z.number().int().nonnegative(),
  tokenCost: z.number().nonnegative().default(0),
  retryCount: z.number().int().nonnegative().default(0),
  humanTakeover: z.boolean().default(false),
});
export type SkillRuntimeFeedbackCreateBody = z.infer<typeof skillRuntimeFeedbackCreateBodySchema>;

export const skillExperimentCreateBodySchema = z.object({
  controlSkillRecordId: z.number().int().positive(),
  candidateSkillRecordId: z.number().int().positive(),
  trafficRatio: z.number().min(0.01).max(0.99),
  status: experimentStatusSchema.default("draft"),
});
export type SkillExperimentCreateBody = z.infer<typeof skillExperimentCreateBodySchema>;

export const scorecardResponseSchema = z.object({
  skillRecordId: z.number().int().positive(),
  totalRuns: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  avgLatencyMs: z.number().nonnegative(),
  p95LatencyMs: z.number().nonnegative(),
  avgTokenCost: z.number().nonnegative(),
  humanTakeoverRate: z.number().min(0).max(1),
  rollbackSuggested: z.boolean(),
  rollbackReason: z.string().optional(),
});
export type ScorecardResponse = z.infer<typeof scorecardResponseSchema>;

export const skillExperimentListItemSchema = z.object({
  id: z.number().int().positive(),
  controlSkillRecordId: z.number().int().positive(),
  candidateSkillRecordId: z.number().int().positive(),
  trafficRatio: z.number().min(0).max(1),
  status: experimentStatusSchema,
  createdAt: z.string().min(1),
});
export type SkillExperimentListItem = z.infer<typeof skillExperimentListItemSchema>;

export const skillExperimentListResponseSchema = z.object({
  experiments: z.array(skillExperimentListItemSchema),
});
export type SkillExperimentListResponse = z.infer<typeof skillExperimentListResponseSchema>;

export const skillFeedbackTrendPointSchema = z.object({
  day: z.string().min(1),
  totalRuns: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  avgLatencyMs: z.number().nonnegative(),
  avgTokenCost: z.number().nonnegative(),
  humanTakeoverRate: z.number().min(0).max(1),
});
export type SkillFeedbackTrendPoint = z.infer<typeof skillFeedbackTrendPointSchema>;

export const skillFeedbackTrendResponseSchema = z.object({
  points: z.array(skillFeedbackTrendPointSchema),
});
export type SkillFeedbackTrendResponse = z.infer<typeof skillFeedbackTrendResponseSchema>;

export const skillRollbackBodySchema = z.object({
  targetSkillRecordId: z.number().int().positive().optional(),
  mode: rollbackModeSchema.default("manual"),
  reason: z.string().max(2000).optional(),
  operator: z.string().min(1).max(128),
});
export type SkillRollbackBody = z.infer<typeof skillRollbackBodySchema>;

export const runtimeMatchRequestSchema = z.object({
  taskType: z.string().min(1).max(128),
  format: z.enum(["cursor", "claude"]).optional(),
});
export type RuntimeMatchRequest = z.infer<typeof runtimeMatchRequestSchema>;

export const runtimeMatchResponseSchema = z.object({
  matched: z.boolean(),
  skillRecordId: z.number().int().positive().optional(),
});
export type RuntimeMatchResponse = z.infer<typeof runtimeMatchResponseSchema>;
