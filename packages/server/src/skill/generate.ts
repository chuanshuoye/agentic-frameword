import {
  skillBundleLayoutSchema,
  skillGenerateResponseSchema,
  type SkillGenerateResponse,
  type SkillBundle,
  type SkillFormat,
  type SkillIssue,
  type SkillGenerateRequest,
} from "@agentic/shared";
import type Database from "better-sqlite3";
import { SkillGenerateError } from "./errors.js";
import { skillLlmApiKeyFromEnv, skillLlmBaseUrl, skillLlmModel } from "./env.js";
import { buildSystemPrompt, buildUserPrompt, mergeWarnings, SKILL_PROMPT_VERSION } from "./prompts.js";
import {
  callChatCompletionsJsonText,
  repairChatCompletionsJsonText,
  stripMarkdownJsonFence,
  type ChatMessage,
  type SkillLlmAttemptMeta,
} from "./llm.js";
import { runPolicyRules, SKILL_RULES_VERSION } from "./policyRules.js";
import { verifySkillBundles } from "./verifySkillBundle.js";
import { buildQualityReport } from "./qualityReport.js";
import { normalizeBundlesToFiles } from "./fileTree.js";

function resolveApiKey(req: SkillGenerateRequest): string {
  const fromBody = req.apiKey?.trim();
  if (fromBody) {
    return fromBody;
  }
  const fromEnv = skillLlmApiKeyFromEnv();
  return fromEnv;
}

function resolveModel(req: SkillGenerateRequest): string {
  if (req.model?.trim()) {
    return req.model.trim();
  }
  return skillLlmModel();
}

function requestedFormats(req: SkillGenerateRequest): SkillFormat[] {
  if (!req.formats || req.formats.length === 0) {
    return ["cursor"];
  }
  return [...new Set(req.formats)];
}

function assertBundlesMatchRequested(requested: SkillFormat[], bundles: SkillBundle[]): void {
  if (bundles.length !== requested.length) {
    throw new SkillGenerateError(
      422,
      "skill_bundle_count",
      `bundles 数量应为 ${requested.length}，实际为 ${bundles.length}`,
    );
  }
  const byFormat = new Map(bundles.map((b) => [b.format, b]));
  for (const f of requested) {
    if (!byFormat.has(f)) {
      throw new SkillGenerateError(422, "skill_missing_format", `JSON 中缺少范式 bundle: ${f}`);
    }
  }
  for (const b of bundles) {
    if (!requested.includes(b.format)) {
      throw new SkillGenerateError(422, "skill_extra_format", `未请求的范式: ${b.format}`);
    }
  }
}

function issueToWarning(issue: SkillIssue): string {
  return `[${issue.severity}] ${issue.code}: ${issue.message}`;
}

function buildSkillResponseJsonSchema(formats: SkillFormat[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      warnings: { type: "array", items: { type: "string" } },
      bundles: {
        type: "array",
        minItems: formats.length,
        maxItems: formats.length,
        items: {
          type: "object",
          properties: {
            format: { enum: formats },
            layout: { enum: skillBundleLayoutSchema.options },
            skillId: { type: "string" },
            files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  content: { type: "string" },
                },
                required: ["path", "content"],
                additionalProperties: false,
              },
            },
            fileTree: {
              type: "object",
              properties: {
                type: { const: "dir" },
                name: { type: "string" },
                children: { type: "array" },
              },
              required: ["type", "name", "children"],
            },
          },
          required: ["format", "skillId"],
          additionalProperties: false,
        },
      },
    },
    required: ["bundles"],
    additionalProperties: false,
  };
}

/**
 * 基于 userGoal 生成 Skill bundles。不读取 run events；`db`/`runId` 仅为路由层签名兼容保留。
 */
export async function generateSkillFromRun(
  _db: Database.Database,
  _runId: string,
  req: SkillGenerateRequest,
): Promise<SkillGenerateResponse> {
  void _db;
  void _runId;
  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    throw new SkillGenerateError(
      503,
      "llm_not_configured",
      "未配置 AGENTIC_SKILL_LLM_API_KEY，且请求未提供 apiKey",
    );
  }

  const formats = requestedFormats(req);
  const model = resolveModel(req);
  const baseUrl = skillLlmBaseUrl();

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(formats) },
    {
      role: "user",
      content: buildUserPrompt({
        userGoal: req.userGoal,
        formats,
      }),
    },
  ];
  const llmOptions = {
    baseUrl,
    apiKey,
    model,
    messages,
    jsonSchema: buildSkillResponseJsonSchema(formats),
  };
  const initial = await callChatCompletionsJsonText(llmOptions);
  let raw = initial.text;
  const llmAttempts: SkillLlmAttemptMeta[] = [...initial.attempts];

  let parsed: ReturnType<typeof skillGenerateResponseSchema.safeParse> | null = null;
  for (let i = 0; i < 2; i += 1) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(stripMarkdownJsonFence(raw));
    } catch {
      parsedJson = null;
    }
    parsed = skillGenerateResponseSchema.safeParse(parsedJson);
    if (parsed.success) {
      break;
    }
    if (i === 0) {
      const repair = await repairChatCompletionsJsonText(
        llmOptions,
        raw,
        parsed?.error?.message ?? "invalid_json_or_schema",
      );
      raw = repair.text;
      llmAttempts.push(...repair.attempts);
    }
  }
  if (!parsed || !parsed.success) {
    throw new SkillGenerateError(422, "skill_shape_invalid", "模型返回内容不是合法 Skill JSON 结构");
  }

  assertBundlesMatchRequested(formats, parsed.data.bundles);
  const normalized = normalizeBundlesToFiles(parsed.data.bundles);

  const verificationIssues = verifySkillBundles(normalized.bundles);
  const policyIssues = runPolicyRules(normalized.bundles);
  const issues = [...verificationIssues, ...policyIssues];
  const qualityReport = buildQualityReport({
    issues,
    source: "user_goal_only",
  });

  const warnings = mergeWarnings(undefined, parsed.data);
  const issueWarnings = issues.map(issueToWarning).slice(0, 20);
  const finalWarnings = [...warnings, ...issueWarnings];

  return {
    ...parsed.data,
    warnings: finalWarnings.length > 0 ? finalWarnings : undefined,
    issues: issues.length > 0 ? issues : undefined,
    qualityReport,
    generationMeta: {
      generatedAt: new Date().toISOString(),
      model,
      promptVersion: SKILL_PROMPT_VERSION,
      rulesVersion: SKILL_RULES_VERSION,
      layoutUsed: normalized.layoutUsed,
      llmAttempts: llmAttempts.length > 0 ? llmAttempts : undefined,
      contextPolicy: {
        source: "user_goal_only",
      },
    },
  };
}
