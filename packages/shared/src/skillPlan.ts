import { z } from "zod";

export const skillPlanAgentIdSchema = z.enum(["skillGenerateAgent"]);
export type SkillPlanAgentId = z.infer<typeof skillPlanAgentIdSchema>;

export const skillPlanRequestSchema = z
  .object({
    agentIds: z.array(z.string().min(1).max(256)).max(50).optional(),
    maxContextEvents: z.number().int().min(1).max(500).optional(),
    model: z.string().min(1).max(128).optional(),
    apiKey: z.string().min(1).max(4000).optional(),
    agentId: skillPlanAgentIdSchema.optional(),
    userHint: z.string().min(1).max(4000).optional(),
  })
  .strict();

export type SkillPlanRequest = z.infer<typeof skillPlanRequestSchema>;
