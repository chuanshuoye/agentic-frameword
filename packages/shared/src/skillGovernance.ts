import { z } from "zod";

export const policySeveritySchema = z.enum(["info", "warning", "high", "block"]);
export type PolicySeverity = z.infer<typeof policySeveritySchema>;

export const policyDecisionSchema = z.enum(["allow", "review_required", "deny"]);
export type PolicyDecision = z.infer<typeof policyDecisionSchema>;

export const skillReviewDecisionSchema = z.enum(["approved", "rejected"]);
export type SkillReviewDecision = z.infer<typeof skillReviewDecisionSchema>;

export const skillReleaseStatusSchema = z.enum(["released", "rolled_back", "revoked"]);
export type SkillReleaseStatus = z.infer<typeof skillReleaseStatusSchema>;

export const skillPolicyRuleSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(128),
  severity: policySeveritySchema,
  scope: z.string().min(1).max(128),
  config: z.record(z.unknown()).nullable(),
  enabled: z.boolean(),
  createdAt: z.string().min(1),
});
export type SkillPolicyRule = z.infer<typeof skillPolicyRuleSchema>;

export const skillPolicyHitSchema = z.object({
  id: z.number().int().positive(),
  skillRecordId: z.number().int().positive(),
  ruleId: z.number().int().positive().nullable(),
  ruleName: z.string().min(1).max(128),
  severity: policySeveritySchema,
  decision: policyDecisionSchema,
  evidence: z.record(z.unknown()).nullable(),
  createdAt: z.string().min(1),
});
export type SkillPolicyHit = z.infer<typeof skillPolicyHitSchema>;

export const skillReviewSchema = z.object({
  id: z.number().int().positive(),
  skillRecordId: z.number().int().positive(),
  reviewer: z.string().min(1).max(128),
  decision: skillReviewDecisionSchema,
  reason: z.string().min(1).max(2000).optional(),
  createdAt: z.string().min(1),
});
export type SkillReview = z.infer<typeof skillReviewSchema>;

export const skillReleaseSchema = z.object({
  id: z.number().int().positive(),
  skillRecordId: z.number().int().positive(),
  channel: z.string().min(1).max(64),
  status: skillReleaseStatusSchema,
  approvedBy: z.string().min(1).max(128),
  createdAt: z.string().min(1),
});
export type SkillRelease = z.infer<typeof skillReleaseSchema>;

export const skillReviewCreateBodySchema = z.object({
  reviewer: z.string().min(1).max(128),
  decision: skillReviewDecisionSchema,
  reason: z.string().min(1).max(2000).optional(),
});
export type SkillReviewCreateBody = z.infer<typeof skillReviewCreateBodySchema>;

export const skillReleaseCreateBodySchema = z.object({
  channel: z.string().min(1).max(64).default("default"),
  approvedBy: z.string().min(1).max(128),
});
export type SkillReleaseCreateBody = z.infer<typeof skillReleaseCreateBodySchema>;

export const governanceDetailResponseSchema = z.object({
  rules: z.array(skillPolicyRuleSchema),
  hits: z.array(skillPolicyHitSchema),
  reviews: z.array(skillReviewSchema),
  releases: z.array(skillReleaseSchema),
  gateDecision: policyDecisionSchema,
});
export type GovernanceDetailResponse = z.infer<typeof governanceDetailResponseSchema>;
