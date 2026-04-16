import type Database from "better-sqlite3";
import {
  harnessReviewResponseSchema,
  parseHarnessReviewLlmJson,
  type HarnessFailureCase,
  type HarnessReviewLlmOutput,
  type HarnessReviewRequest,
  type HarnessReviewResponse,
} from "@agentic/shared";
import { DEFAULT_HARNESS_REVIEW_AGENT_ID, getHarnessReviewAgent } from "@agentic/skill-agents";
import { SkillGenerateError } from "./errors.js";
import { skillLlmApiKeyFromEnv, skillLlmBaseUrl, skillLlmModel } from "./env.js";
import { buildRunObservationPackage } from "./runContext.js";
import { callChatCompletionsJsonText, repairChatCompletionsJsonText, stripMarkdownJsonFence, type ChatMessage } from "./llm.js";
import { mergeFailureCasesToAgentMd } from "./agentMdWriter.js";

function resolveApiKey(req: HarnessReviewRequest): string {
  return req.apiKey?.trim() || skillLlmApiKeyFromEnv();
}

function resolveModel(req: HarnessReviewRequest): string {
  return req.model?.trim() || skillLlmModel();
}

function fingerprintOf(item: HarnessFailureCase): string {
  const base = `${item.runId}|${item.agentId ?? "unknown"}|${item.failureType}|${item.symptom}`.toLowerCase();
  let h = 0;
  for (let i = 0; i < base.length; i += 1) {
    h = (h << 5) - h + base.charCodeAt(i);
    h |= 0;
  }
  return `fp_${Math.abs(h)}`;
}

function buildHarnessReviewJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      summary: { type: "string" },
      cases: {
        type: "array",
        items: {
          type: "object",
          properties: {
            caseId: { type: "string" },
            runId: { type: "string" },
            agentId: { type: "string" },
            failureType: {
              enum: [
                "tool_error",
                "policy_violation",
                "missing_prereq",
                "rollback_missing",
                "instruction_drift",
                "handoff_break",
                "other",
              ],
            },
            symptom: { type: "string" },
            evidence: { type: "array", items: { type: "string" } },
            rootCauseHypothesis: { type: "string" },
            recoveryFix: { type: "string" },
            guardrails: { type: "array", items: { type: "string" } },
            severity: { enum: ["low", "medium", "high"] },
          },
          required: ["failureType", "symptom", "severity"],
          additionalProperties: false,
        },
      },
    },
    required: ["summary", "cases"],
    additionalProperties: false,
  };
}

export async function reviewRunFailures(
  db: Database.Database,
  runId: string,
  req: HarnessReviewRequest,
): Promise<HarnessReviewResponse> {
  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    throw new SkillGenerateError(503, "llm_not_configured", "未配置 AGENTIC_SKILL_LLM_API_KEY，且请求未提供 apiKey");
  }
  const mode = req.mode ?? "write_agent_md";
  const model = resolveModel(req);
  const baseUrl = skillLlmBaseUrl();

  const pkg = buildRunObservationPackage(db, runId, {
    agentIds: req.agentIds,
    maxContextEvents: req.maxContextEvents,
  });

  const agent = getHarnessReviewAgent(DEFAULT_HARNESS_REVIEW_AGENT_ID);
  if (!agent) {
    throw new SkillGenerateError(500, "harness_agent_missing", "harnessSkillAgent 未注册");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: agent.buildHarnessReviewSystemPrompt() },
    {
      role: "user",
      content: agent.buildHarnessReviewUserPrompt({
        runId,
        observationSummary: pkg.observationSummary,
        kindSummary: pkg.kindSummary,
        userNote: req.note,
      }),
    },
  ];

  const llmOptions = {
    baseUrl,
    apiKey,
    model,
    messages,
    jsonSchema: buildHarnessReviewJsonSchema(),
  };
  const first = await callChatCompletionsJsonText(llmOptions);
  let raw = first.text;
  let parsedData: HarnessReviewLlmOutput | null = null;
  let lastShapeError = "invalid_json_or_schema";
  for (let i = 0; i < 2; i += 1) {
    let parsedJson: unknown = null;
    try {
      parsedJson = JSON.parse(stripMarkdownJsonFence(raw));
    } catch {
      parsedJson = null;
    }
    const norm = parseHarnessReviewLlmJson(runId, parsedJson);
    if (norm.ok) {
      parsedData = norm.data;
      break;
    }
    lastShapeError = norm.error;
    if (i === 0) {
      const repair = await repairChatCompletionsJsonText(llmOptions, raw, norm.error);
      raw = repair.text;
    }
  }
  if (!parsedData) {
    throw new SkillGenerateError(
      422,
      "harness_review_shape_invalid",
      `失败复盘输出结构无效：${lastShapeError.slice(0, 500)}`,
    );
  }

  const now = new Date().toISOString();
  const normalizedCases = parsedData.cases.map((item, idx) => {
    const normalized: HarnessFailureCase = {
      ...item,
      runId,
      caseId: item.caseId || `case_${idx + 1}`,
      failureFingerprint: item.failureFingerprint ?? fingerprintOf(item),
      updatedAt: now,
      hitCount: item.hitCount ?? 1,
    };
    return normalized;
  });

  const writeResult = await mergeFailureCasesToAgentMd({
    mode,
    cases: normalizedCases,
  });

  const out: HarnessReviewResponse = {
    summary: parsedData.summary,
    cases: normalizedCases,
    writeResult,
  };
  const checked = harnessReviewResponseSchema.safeParse(out);
  if (!checked.success) {
    throw new SkillGenerateError(500, "harness_review_response_invalid", checked.error.message);
  }
  return checked.data;
}
