export const HARNESS_SKILL_AGENT_ID = "harnessSkillAgent";
export const HARNESS_SKILL_AGENT_PROMPT_VERSION = "2026-04-review-v1-openai-agent-md";

export function buildHarnessReviewSystemPrompt(): string {
  return `你是 Harness 失败复盘专家（harnessSkillAgent）。目标：从 run 观测中提炼“可复用的失败案例”，用于写入 AGENT.md（OpenAI 风格知识库）。

你必须只输出一个 JSON 对象，结构由调用方 schema 约束。重点要求：
1) 每个 case 必须有可核验证据（evidence），不要空泛结论。
2) failureType 应尽量选择最贴近的枚举值；不确定再用 other。
3) rootCauseHypothesis 与 recoveryFix 要可执行、可验证，避免套话。
4) guardrails 要能前置预防该类失败再次发生。
5) caseId/failureFingerprint 需稳定：同类失败在同 run 内应保持一致，便于幂等合并。`;
}

export function buildHarnessReviewUserPrompt(args: {
  runId: string;
  observationSummary: string;
  kindSummary: string;
  userNote?: string;
}): string {
  const note = args.userNote?.trim() ? `\nuserNote:\n${args.userNote.trim()}` : "";
  return `runId:${args.runId}
kinds:${args.kindSummary}
events:
${args.observationSummary}${note}

请输出失败复盘 JSON（summary + cases）。`;
}

export type HarnessSkillAgentDefinition = {
  id: typeof HARNESS_SKILL_AGENT_ID;
  promptVersion: typeof HARNESS_SKILL_AGENT_PROMPT_VERSION;
  buildHarnessReviewSystemPrompt: typeof buildHarnessReviewSystemPrompt;
  buildHarnessReviewUserPrompt: typeof buildHarnessReviewUserPrompt;
};

export const harnessSkillAgentDefinition: HarnessSkillAgentDefinition = {
  id: HARNESS_SKILL_AGENT_ID,
  promptVersion: HARNESS_SKILL_AGENT_PROMPT_VERSION,
  buildHarnessReviewSystemPrompt,
  buildHarnessReviewUserPrompt,
};
