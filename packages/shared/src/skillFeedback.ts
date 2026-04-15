import { z } from "zod";

export const humanFeedbackRoleSchema = z.enum(["user", "reviewer", "agent"]);
export type HumanFeedbackRole = z.infer<typeof humanFeedbackRoleSchema>;

export const humanFeedbackSentimentSchema = z.enum(["positive", "neutral", "negative"]);
export type HumanFeedbackSentiment = z.infer<typeof humanFeedbackSentimentSchema>;

export const humanFeedbackSeveritySchema = z.enum(["low", "medium", "high"]);
export type HumanFeedbackSeverity = z.infer<typeof humanFeedbackSeveritySchema>;

export const humanFeedbackCreateBodySchema = z.object({
  runId: z.string().min(1).max(512).optional(),
  role: humanFeedbackRoleSchema,
  sentiment: humanFeedbackSentimentSchema,
  problemType: z.string().min(1).max(128),
  severity: humanFeedbackSeveritySchema,
  freeText: z.string().min(1).max(5000),
  suggestion: z.string().max(5000).optional(),
});
export type HumanFeedbackCreateBody = z.infer<typeof humanFeedbackCreateBodySchema>;

export const humanFeedbackItemSchema = z.object({
  id: z.number().int().positive(),
  skillRecordId: z.number().int().positive(),
  runId: z.string().nullable(),
  role: humanFeedbackRoleSchema,
  sentiment: humanFeedbackSentimentSchema,
  problemType: z.string().min(1).max(128),
  severity: humanFeedbackSeveritySchema,
  freeText: z.string().min(1).max(5000),
  suggestion: z.string().nullable(),
  createdAt: z.string().min(1),
});
export type HumanFeedbackItem = z.infer<typeof humanFeedbackItemSchema>;

export const humanFeedbackListResponseSchema = z.object({
  feedback: z.array(humanFeedbackItemSchema),
});
export type HumanFeedbackListResponse = z.infer<typeof humanFeedbackListResponseSchema>;

export const regenerateFromFeedbackBodySchema = z.object({
  limit: z.number().int().min(1).max(50).default(10).optional(),
});
export type RegenerateFromFeedbackBody = z.infer<typeof regenerateFromFeedbackBodySchema>;

export const skillVersionItemSchema = z.object({
  id: z.number().int().positive(),
  version: z.number().int().positive(),
  parentSkillRecordId: z.number().int().positive().nullable(),
  status: z.string().min(1),
  changeSummary: z.string().nullable(),
  createdAt: z.string().min(1),
});
export type SkillVersionItem = z.infer<typeof skillVersionItemSchema>;

export const skillVersionListResponseSchema = z.object({
  versions: z.array(skillVersionItemSchema),
});
export type SkillVersionListResponse = z.infer<typeof skillVersionListResponseSchema>;
