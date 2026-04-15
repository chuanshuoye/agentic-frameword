import { z } from "zod";

export const distillStrategySchema = z.enum(["map_reduce", "refine", "hierarchical"]);
export const factualityModeSchema = z.enum(["strict_extract_only", "balanced"]);

export const distillConfigSchema = z.object({
  chunkSizeTokens: z.number().int().min(300).max(4000).default(1000),
  chunkOverlapTokens: z.number().int().min(0).max(800).default(150),
  strategy: distillStrategySchema.default("map_reduce"),
  detailLevel: z.number().min(0).max(1).default(0.5),
  targetCompressionRatio: z.number().min(0.05).max(0.8).default(0.2),
  maxOutputTokens: z.number().int().min(200).max(16_000).default(3000),
  maxBullets: z.number().int().min(3).max(30).default(12),
  maxSentencesPerBullet: z.number().int().min(1).max(6).default(2),
  factualityMode: factualityModeSchema.default("strict_extract_only"),
  outputTemplate: z
    .object({
      sections: z
        .array(z.enum(["goal", "decisions", "changes", "openIssues", "nextActions"]))
        .min(3)
        .max(5)
        .default(["goal", "decisions", "changes", "openIssues", "nextActions"]),
    })
    .default({ sections: ["goal", "decisions", "changes", "openIssues", "nextActions"] }),
  temperature: z.number().min(0).max(1).default(0.2),
  topP: z.number().min(0).max(1).default(1),
  model: z.string().min(1).max(128).optional(),
  parallelism: z.number().int().min(1).max(12).default(4),
  maxRetries: z.number().int().min(0).max(5).default(1),
  timeoutMs: z.number().int().min(2000).max(180_000).default(45_000),
  budgetTokens: z.number().int().min(1000).max(2_000_000).default(200_000),
  qualityChecks: z
    .object({
      minCoverageRatio: z.number().min(0.1).max(1).default(0.7),
      maxDuplicateRatio: z.number().min(0).max(0.5).default(0.2),
      maxLengthDeviationRatio: z.number().min(0).max(1).default(0.35),
      requireSections: z
        .array(z.enum(["goal", "decisions", "changes", "openIssues", "nextActions"]))
        .min(1)
        .max(5)
        .default(["goal", "decisions", "changes", "openIssues", "nextActions"]),
    })
    .default({
      minCoverageRatio: 0.7,
      maxDuplicateRatio: 0.2,
      maxLengthDeviationRatio: 0.35,
      requireSections: ["goal", "decisions", "changes", "openIssues", "nextActions"],
    }),
});

export const sessionDistillRequestSchema = z
  .object({
    transcriptsDir: z.string().min(1).max(2000),
    sourceFiles: z.array(z.string().min(1).max(4000)).min(1).max(200),
    outputDir: z.string().min(1).max(2000).optional(),
    outputFileName: z.string().min(1).max(255).optional(),
    projectName: z.string().min(1).max(255).optional(),
    agentId: z.string().min(1).max(255).optional(),
    title: z.string().min(1).max(255).optional(),
    syncAfterWrite: z.boolean().default(true),
    apiKey: z.string().min(1).max(4000).optional(),
    config: distillConfigSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.outputFileName && !data.outputFileName.endsWith(".jsonl")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "outputFileName_must_end_with_jsonl",
      });
    }
  });

export type DistillConfig = z.infer<typeof distillConfigSchema>;
export type SessionDistillRequest = z.infer<typeof sessionDistillRequestSchema>;
