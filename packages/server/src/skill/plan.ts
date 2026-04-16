import type Database from "better-sqlite3";
import type { SkillPlanRequest } from "@agentic/shared";
import { DEFAULT_SKILL_PLAN_AGENT_ID, getSkillPlanAgent } from "@agentic/skill-agents";
import { SkillGenerateError } from "./errors.js";
import { skillPlanLlmApiKeyFromEnv, skillPlanLlmBaseUrl, skillPlanLlmModel, skillLlmApiKeyFromEnv, skillLlmModel } from "./env.js";
import { buildInputWarnings, buildRunObservationPackage } from "./runContext.js";
import { callChatCompletionsPlainText, stripMarkdownJsonFence, type ChatMessage } from "./llm.js";

function resolvePlanApiKey(req: SkillPlanRequest): string {
  const fromBody = req.apiKey?.trim();
  if (fromBody) {
    return fromBody;
  }
  const fromEnv = skillPlanLlmApiKeyFromEnv();
  if (fromEnv) {
    return fromEnv;
  }
  return skillLlmApiKeyFromEnv();
}

function resolvePlanModel(req: SkillPlanRequest): string {
  if (req.model?.trim()) {
    return req.model.trim();
  }
  return skillPlanLlmModel();
}

function stripOuterFences(text: string): string {
  const t = stripMarkdownJsonFence(text.trim());
  const code = t.match(/^```[a-zA-Z]*\s*([\s\S]*?)```$/m);
  if (code) {
    return code[1].trim();
  }
  return t;
}

/**
 * 从 run 提炼 userGoal 正文（纯文本）。不含 JSON 包装；可与服务端预警合并为一段文本。
 */
export async function planSkillUserGoalFromRun(
  db: Database.Database,
  runId: string,
  req: SkillPlanRequest,
): Promise<string> {
  const apiKey = resolvePlanApiKey(req);
  if (!apiKey) {
    throw new SkillGenerateError(
      503,
      "llm_not_configured",
      "未配置 AGENTIC_SKILL_LLM_API_KEY / AGENTIC_SKILL_PLAN_LLM_API_KEY，且请求未提供 apiKey",
    );
  }

  const agentId = req.agentId ?? DEFAULT_SKILL_PLAN_AGENT_ID;
  const agent = getSkillPlanAgent(agentId);
  if (!agent) {
    throw new SkillGenerateError(400, "unknown_plan_agent", `不支持的 agentId: ${agentId}`);
  }

  const pkg = buildRunObservationPackage(db, runId, {
    agentIds: req.agentIds,
    maxContextEvents: req.maxContextEvents,
  });

  const preWarnings = buildInputWarnings({
    filteredEvents: pkg.filtered.length,
    selectedEvents: pkg.capped.length,
    kindSummary: pkg.kindSummary,
    requestedAgentIds: req.agentIds,
    selectedAgentIds: pkg.selectedAgentIds,
  });

  const model = resolvePlanModel(req);
  const baseUrl = skillPlanLlmBaseUrl();

  const messages: ChatMessage[] = [
    { role: "system", content: agent.buildPlanSystemPrompt() },
    {
      role: "user",
      content: agent.buildPlanUserPrompt({
        runId,
        observationSummary: pkg.observationSummary,
        kindSummary: pkg.kindSummary,
        userHint: req.userHint,
      }),
    },
  ];

  const { text } = await callChatCompletionsPlainText({
    baseUrl,
    apiKey,
    model,
    messages,
  });

  const body = stripOuterFences(text).trim();
  if (body.length === 0) {
    throw new SkillGenerateError(422, "skill_plan_empty", "模型返回空文本");
  }

  if (preWarnings.length === 0) {
    return body;
  }

  const head = ["【上下文预警】", ...preWarnings.map((w) => `- ${w}`), "", "【能力说明（userGoal）】", ""].join("\n");
  return `${head}${body}`;
}
