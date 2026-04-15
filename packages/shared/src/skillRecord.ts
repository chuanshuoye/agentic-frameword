import { z } from "zod";
import {
  skillBundleSchema,
  skillFormatSchema,
  skillGenerationMetaSchema,
} from "./skillGenerate.js";

/** Skill 库记录状态（人工审核流预留） */
export const skillRecordStatusSchema = z.enum(["draft", "review_required", "accepted", "rejected"]);
export type SkillRecordStatus = z.infer<typeof skillRecordStatusSchema>;

/** 落库请求：每条 DB 行对应 bundles 中的一项（多范式则多行） */
export const skillRecordCreateBodySchema = z.object({
  runId: z.string().min(1).max(512).optional(),
  bundles: z.array(skillBundleSchema).min(1).max(2),
  generationMeta: skillGenerationMetaSchema.optional(),
});

export type SkillRecordCreateBody = z.infer<typeof skillRecordCreateBodySchema>;

export const skillRecordCreateResponseSchema = z.object({
  ok: z.literal(true),
  ids: z.array(z.number().int().positive()).min(1),
});

export type SkillRecordCreateResponse = z.infer<typeof skillRecordCreateResponseSchema>;

export const skillRecordListItemSchema = z.object({
  id: z.number().int().positive(),
  runId: z.string().nullable(),
  format: skillFormatSchema,
  skillId: z.string(),
  version: z.number().int().positive(),
  status: skillRecordStatusSchema,
  createdAt: z.string().min(1),
});

export type SkillRecordListItem = z.infer<typeof skillRecordListItemSchema>;

export const skillRecordListResponseSchema = z.object({
  skills: z.array(skillRecordListItemSchema),
});

export type SkillRecordListResponse = z.infer<typeof skillRecordListResponseSchema>;

const skillFileRowSchema = z.object({
  path: z.string(),
  content: z.string(),
});

export const skillRecordDetailSchema = skillRecordListItemSchema.extend({
  files: z.array(skillFileRowSchema).min(1),
  meta: z.record(z.unknown()).nullable(),
});

export type SkillRecordDetail = z.infer<typeof skillRecordDetailSchema>;

export const skillRecordPatchBodySchema = z.object({
  status: skillRecordStatusSchema,
});

export type SkillRecordPatchBody = z.infer<typeof skillRecordPatchBodySchema>;

/** 异步作业占位（与 server async_jobs 表一致） */
export const asyncJobTypeSchema = z.enum(["skill_generate", "session_distill", "skill_save"]);
export type AsyncJobType = z.infer<typeof asyncJobTypeSchema>;

export const asyncJobStatusSchema = z.enum(["pending", "running", "completed", "failed"]);
export type AsyncJobStatus = z.infer<typeof asyncJobStatusSchema>;

/** 复盘占位：请求体（真实结构化归因后续迭代） */
export const runReviewCreateBodySchema = z.object({
  note: z.string().max(8000).optional(),
});

export type RunReviewCreateBody = z.infer<typeof runReviewCreateBodySchema>;