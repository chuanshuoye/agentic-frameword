import { z } from "zod";

export const harnessReviewRequestSchema = z
  .object({
    note: z.string().max(8000).optional(),
    agentIds: z.array(z.string().min(1).max(256)).max(50).optional(),
    maxContextEvents: z.number().int().min(1).max(500).optional(),
    model: z.string().min(1).max(128).optional(),
    apiKey: z.string().min(1).max(4000).optional(),
    mode: z.enum(["dry_run", "write_agent_md"]).optional(),
  })
  .strict();

export type HarnessReviewRequest = z.infer<typeof harnessReviewRequestSchema>;

export const harnessFailureCaseSchema = z
  .object({
    caseId: z.string().min(1).max(128),
    runId: z.string().min(1).max(512),
    agentId: z.string().min(1).max(256).optional(),
    failureType: z
      .enum([
        "tool_error",
        "policy_violation",
        "missing_prereq",
        "rollback_missing",
        "instruction_drift",
        "handoff_break",
        "other",
      ])
      .default("other"),
    symptom: z.string().min(1).max(2000),
    evidence: z.array(z.string().min(1).max(2000)).min(1).max(10),
    rootCauseHypothesis: z.string().min(1).max(2000),
    recoveryFix: z.string().min(1).max(2000),
    guardrails: z.array(z.string().min(1).max(800)).min(1).max(10),
    severity: z.enum(["low", "medium", "high"]).default("medium"),
    failureFingerprint: z.string().min(1).max(128).optional(),
    updatedAt: z.string().min(1).max(64).optional(),
    hitCount: z.number().int().min(1).optional(),
  })
  .strict();

export type HarnessFailureCase = z.infer<typeof harnessFailureCaseSchema>;

export const harnessReviewLlmOutputSchema = z
  .object({
    summary: z.string().min(1).max(4000),
    cases: z.array(harnessFailureCaseSchema).max(50),
  })
  .strict();

export type HarnessReviewLlmOutput = z.infer<typeof harnessReviewLlmOutputSchema>;

const FAILURE_TYPES = [
  "tool_error",
  "policy_violation",
  "missing_prereq",
  "rollback_missing",
  "instruction_drift",
  "handoff_break",
  "other",
] as const;

function clampStr(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) {
    return t;
  }
  if (max <= 1) {
    return "…";
  }
  return `${t.slice(0, max - 1)}…`;
}

function stringListFromUnknown(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) {
    return [];
  }
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") {
      continue;
    }
    const c = clampStr(x, maxLen);
    if (c.length === 0) {
      continue;
    }
    out.push(c);
    if (out.length >= maxItems) {
      break;
    }
  }
  return out;
}

function coalesceFailureType(v: unknown): (typeof FAILURE_TYPES)[number] {
  if (typeof v === "string" && (FAILURE_TYPES as readonly string[]).includes(v)) {
    return v as (typeof FAILURE_TYPES)[number];
  }
  return "other";
}

function coalesceSeverity(v: unknown): "low" | "medium" | "high" {
  if (v === "low" || v === "medium" || v === "high") {
    return v;
  }
  return "medium";
}

function normalizeOneCaseFromLlm(runId: string, item: unknown, idx: number): HarnessFailureCase {
  const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};

  let symptom = typeof o.symptom === "string" ? clampStr(o.symptom, 2000) : "";
  if (symptom.length === 0) {
    symptom = "（模型未描述症状，请结合原始事件人工复核。）";
  }

  let evidence = stringListFromUnknown(o.evidence, 10, 2000);
  if (evidence.length === 0) {
    evidence = [symptom.length <= 2000 ? symptom : `${symptom.slice(0, 1997)}…`];
  }

  let rootCauseHypothesis =
    typeof o.rootCauseHypothesis === "string" ? clampStr(o.rootCauseHypothesis, 2000) : "";
  if (rootCauseHypothesis.length === 0) {
    rootCauseHypothesis = "（模型未给出根因假设，请结合 evidence 人工补充。）";
  }

  let recoveryFix = typeof o.recoveryFix === "string" ? clampStr(o.recoveryFix, 2000) : "";
  if (recoveryFix.length === 0) {
    recoveryFix = "（模型未给出修复建议，请结合根因人工补充可执行步骤。）";
  }

  let guardrails = stringListFromUnknown(o.guardrails, 10, 800);
  if (guardrails.length === 0) {
    guardrails = ["在操作前核对前置条件、权限与回滚路径；关键步骤需可观测校验。"];
  }

  let caseId = typeof o.caseId === "string" ? clampStr(o.caseId, 128) : "";
  if (caseId.length === 0) {
    caseId = `case_${idx + 1}`;
  }

  const agentIdRaw = typeof o.agentId === "string" ? clampStr(o.agentId, 256) : "";
  const agentId = agentIdRaw.length > 0 ? agentIdRaw : undefined;

  const out: HarnessFailureCase = {
    caseId,
    runId,
    agentId,
    failureType: coalesceFailureType(o.failureType),
    symptom,
    evidence,
    rootCauseHypothesis,
    recoveryFix,
    guardrails,
    severity: coalesceSeverity(o.severity),
  };
  return out;
}

/**
 * 将模型返回的 JSON（结构常不完整）规范化为可通过 harnessReviewLlmOutputSchema 的结构。
 */
export function parseHarnessReviewLlmJson(
  runId: string,
  input: unknown,
): { ok: true; data: HarnessReviewLlmOutput } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "根节点须为 JSON 对象" };
  }
  const root = input as Record<string, unknown>;

  let summary = typeof root.summary === "string" ? clampStr(root.summary, 4000) : "";
  if (summary.length === 0) {
    summary = "（模型未返回有效 summary，请结合下方 cases 与原始事件人工补充。）";
  }

  const rawCases = Array.isArray(root.cases) ? root.cases : [];
  const cases: HarnessFailureCase[] = [];
  let i = 0;
  for (const item of rawCases) {
    if (cases.length >= 50) {
      break;
    }
    cases.push(normalizeOneCaseFromLlm(runId, item, i));
    i += 1;
  }

  const candidate: HarnessReviewLlmOutput = { summary, cases };
  const checked = harnessReviewLlmOutputSchema.safeParse(candidate);
  if (!checked.success) {
    return { ok: false, error: checked.error.message };
  }
  return { ok: true, data: checked.data };
}

export const harnessReviewResponseSchema = z
  .object({
    summary: z.string().min(1).max(4000),
    cases: z.array(harnessFailureCaseSchema).max(100),
    writeResult: z
      .object({
        mode: z.enum(["dry_run", "write_agent_md"]),
        path: z.string().min(1).max(1024),
        updated: z.boolean(),
        inserted: z.number().int().nonnegative(),
        merged: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type HarnessReviewResponse = z.infer<typeof harnessReviewResponseSchema>;
