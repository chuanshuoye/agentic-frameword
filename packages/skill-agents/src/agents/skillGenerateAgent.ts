export const SKILL_GENERATE_AGENT_ID = "skillGenerateAgent";
export const SKILL_GENERATE_AGENT_PROMPT_VERSION = "2026-04-plan-v4-compact";

export function buildPlanSystemPrompt(): string {
  return `你是 Skill 能力规划专家（skillGenerateAgent）：读 run 观测摘录，写出可作为下一步 Skill 生成输入的 userGoal 纯文本。后续步骤看不到观测原文，正文须自洽、偏可执行。

输出：普通文本；禁止 JSON/YAML/XML 与全文 Markdown 代码围栏。结构可用小标题/列表（背景、目标、步骤要点、约束与风险、成功标准等），中文为主。勿编造摘录中未出现的命令输出或路径；不确定写「待确认」。建议约 300～1200 字，忌空话。
版本：${SKILL_GENERATE_AGENT_PROMPT_VERSION}。`;
}

export function buildPlanUserPrompt(args: {
  runId: string;
  observationSummary: string;
  kindSummary: string;
  userHint?: string;
}): string {
  const hint =
    args.userHint && args.userHint.trim().length > 0
      ? `\nuserHint:\n${args.userHint.trim()}`
      : "";
  return `runId:${args.runId}
kinds:${args.kindSummary}
events:
${args.observationSummary}${hint}

直接输出 userGoal 正文（首行起笔，无前缀、无 JSON）。`;
}

export type SkillGenerateAgentDefinition = {
  id: typeof SKILL_GENERATE_AGENT_ID;
  promptVersion: typeof SKILL_GENERATE_AGENT_PROMPT_VERSION;
  buildPlanSystemPrompt: typeof buildPlanSystemPrompt;
  buildPlanUserPrompt: typeof buildPlanUserPrompt;
};

export const skillGenerateAgentDefinition: SkillGenerateAgentDefinition = {
  id: SKILL_GENERATE_AGENT_ID,
  promptVersion: SKILL_GENERATE_AGENT_PROMPT_VERSION,
  buildPlanSystemPrompt,
  buildPlanUserPrompt,
};
