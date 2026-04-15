import { z } from "zod";

export const skillFormatSchema = z.enum(["cursor", "claude"]);
export type SkillFormat = z.infer<typeof skillFormatSchema>;
export const skillBundleLayoutSchema = z.enum(["files", "fileTree"]);
export type SkillBundleLayout = z.infer<typeof skillBundleLayoutSchema>;

export const skillGenerateRequestSchema = z
  .object({
    userGoal: z.string().min(1).max(8000),
    agentIds: z.array(z.string().min(1).max(256)).max(50).optional(),
    /** 可多选；省略时仅生成 cursor 范式（兼容旧客户端） */
    formats: z.array(skillFormatSchema).max(2).optional(),
    model: z.string().min(1).max(128).optional(),
    maxContextEvents: z.number().int().min(1).max(500).optional(),
    /** 仅当次请求使用，不得落库或写入日志 */
    apiKey: z.string().min(1).max(4000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.formats !== undefined && data.formats.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "formats_empty",
      });
      return;
    }
    if (data.formats && data.formats.length > 0 && new Set(data.formats).size !== data.formats.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "formats_duplicate",
      });
    }
  });

export type SkillGenerateRequest = z.infer<typeof skillGenerateRequestSchema>;

const skillFileSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[\w./-]+$/, { message: "invalid_path_chars" }),
  content: z.string().max(200_000),
});

export type SkillFileTreeNode = {
  type: "file" | "dir";
  name: string;
  content?: string;
  children?: SkillFileTreeNode[];
};

export const skillFileTreeNodeSchema: z.ZodType<SkillFileTreeNode> = z.lazy(() =>
  z.object({
    type: z.enum(["file", "dir"]),
    name: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[\w.-]+$/, { message: "invalid_tree_name_chars" }),
    content: z.string().max(200_000).optional(),
    children: z.array(skillFileTreeNodeSchema).max(300).optional(),
  }),
);

export const skillFileTreeSchema = z.object({
  type: z.literal("dir"),
  name: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[\w.-]+$/, { message: "invalid_tree_name_chars" }),
  children: z.array(skillFileTreeNodeSchema).min(1).max(500),
});

function hasSkillMdInTree(node: SkillFileTreeNode): boolean {
  if (node.type === "file") {
    return node.name === "SKILL.md";
  }
  for (const child of node.children ?? []) {
    if (hasSkillMdInTree(child)) {
      return true;
    }
  }
  return false;
}

function validateTreeNode(node: SkillFileTreeNode, ctx: z.RefinementCtx, path: string): boolean {
  if (node.type === "file") {
    if (node.children && node.children.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "file_node_children_not_allowed",
        path: [path],
      });
      return false;
    }
    if (typeof node.content !== "string") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "file_node_content_required",
        path: [path],
      });
      return false;
    }
    return true;
  }
  if (typeof node.content === "string") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "dir_node_content_not_allowed",
      path: [path],
    });
    return false;
  }
  if (!node.children || node.children.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "dir_node_children_required",
      path: [path],
    });
    return false;
  }
  let ok = true;
  for (const child of node.children) {
    if (!validateTreeNode(child, ctx, `${path}/${child.name}`)) {
      ok = false;
    }
  }
  return ok;
}

function refineBundle(
  data: {
    files?: { path: string; content: string }[];
    fileTree?: SkillFileTreeNode;
    layout?: SkillBundleLayout;
  },
  ctx: z.RefinementCtx,
): void {
  const hasFiles = Array.isArray(data.files) && data.files.length > 0;
  const hasTree = Boolean(data.fileTree);
  if (!hasFiles && !hasTree) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "files_or_fileTree_required",
    });
    return;
  }
  if (data.layout === "files" && !hasFiles) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "layout_files_requires_files",
    });
    return;
  }
  if (data.layout === "fileTree" && !hasTree) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "layout_fileTree_requires_fileTree",
    });
    return;
  }
  if (hasFiles) {
    refineBundleFiles({ files: data.files ?? [] }, ctx);
  }
  if (hasTree) {
    const treeOk = validateTreeNode(data.fileTree as SkillFileTreeNode, ctx, "root");
    if (treeOk && !hasSkillMdInTree(data.fileTree as SkillFileTreeNode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "must_include_SKILL_md",
      });
    }
  }
}

function refineBundleFiles(data: { files: { path: string; content: string }[] }, ctx: z.RefinementCtx): void {
  for (const f of data.files) {
    if (f.path.includes("..") || f.path.startsWith("/")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "invalid_path",
      });
      return;
    }
  }
  const hasSkillMd = data.files.some(
    (f) => f.path === "SKILL.md" || f.path.endsWith("/SKILL.md"),
  );
  if (!hasSkillMd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "must_include_SKILL_md",
    });
  }
}

export const skillBundleSchema = z
  .object({
    format: skillFormatSchema,
    skillId: z.string().min(1).max(128),
    layout: skillBundleLayoutSchema.optional(),
    files: z.array(skillFileSchema).min(1).max(40).optional(),
    fileTree: skillFileTreeSchema.optional(),
  })
  .superRefine(refineBundle);

export type SkillBundle = z.infer<typeof skillBundleSchema>;

export const skillIssueSeveritySchema = z.enum(["info", "warning", "high"]);
export type SkillIssueSeverity = z.infer<typeof skillIssueSeveritySchema>;

export const skillIssueSchema = z.object({
  code: z.string().min(1).max(128),
  severity: skillIssueSeveritySchema,
  message: z.string().min(1).max(800),
  location: z.string().min(1).max(256).optional(),
  suggestion: z.string().min(1).max(800).optional(),
});
export type SkillIssue = z.infer<typeof skillIssueSchema>;

export const skillQualityDimensionSchema = z.object({
  name: z.string().min(1).max(64),
  score: z.number().int().min(0).max(100),
  reason: z.string().min(1).max(800),
});
export type SkillQualityDimension = z.infer<typeof skillQualityDimensionSchema>;

export const skillQualityReportSchema = z.object({
  score: z.number().int().min(0).max(100),
  verdict: z.enum(["ready", "needs_review", "risky"]),
  dimensions: z.array(skillQualityDimensionSchema).min(1).max(10),
  suggestions: z.array(z.string().min(1).max(800)).max(20).optional(),
});
export type SkillQualityReport = z.infer<typeof skillQualityReportSchema>;

/** Generate 步纯 userGoal 模式（不读取 run events） */
export const skillContextPolicyUserGoalOnlySchema = z
  .object({
    source: z.literal("user_goal_only"),
  })
  .strict();

/** Plan / 历史：基于 run 尾部事件采样的上下文策略 */
export const skillContextPolicyRunTailSchema = z
  .object({
    maxContextEvents: z.number().int().min(1).max(500),
    selectedEvents: z.number().int().nonnegative(),
    totalFilteredEvents: z.number().int().nonnegative(),
    selectedAgentIds: z.array(z.string().min(1).max(256)).max(50).optional(),
    kindSummary: z.string().min(1).max(200),
  })
  .strict();

export const skillContextPolicySchema = z.union([
  skillContextPolicyUserGoalOnlySchema,
  skillContextPolicyRunTailSchema,
]);

export type SkillContextPolicy = z.infer<typeof skillContextPolicySchema>;

export const skillGenerationMetaSchema = z.object({
  generatedAt: z.string().min(1),
  model: z.string().min(1).max(128),
  promptVersion: z.string().min(1).max(64),
  rulesVersion: z.string().min(1).max(64),
  contextPolicy: skillContextPolicySchema.optional(),
  layoutUsed: skillBundleLayoutSchema.optional(),
  llmAttempts: z
    .array(
      z.object({
        mode: z.enum(["json_schema", "json_mode", "fallback_plain", "plain_text", "repair_pass"]),
        ok: z.boolean(),
        status: z.number().int().nullable().optional(),
      }),
    )
    .max(10)
    .optional(),
});
export type SkillGenerationMeta = z.infer<typeof skillGenerationMetaSchema>;

export const skillGenerateResponseSchema = z
  .object({
    bundles: z.array(skillBundleSchema).min(1).max(2),
    warnings: z.array(z.string().max(800)).max(30).optional(),
    issues: z.array(skillIssueSchema).max(100).optional(),
    qualityReport: skillQualityReportSchema.optional(),
    generationMeta: skillGenerationMetaSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const fs = data.bundles.map((b) => b.format);
    if (new Set(fs).size !== fs.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duplicate_bundle_format",
      });
    }
  });

export type SkillGenerateResponse = z.infer<typeof skillGenerateResponseSchema>;
