export const SKILL_GENERATE_AGENT_ID = "skillGenerateAgent";
export const SKILL_GENERATE_AGENT_PROMPT_VERSION = "2026-04-plan-v5-priority";

export function buildPlanSystemPrompt(): string {
  return `你是 Skill 能力规划专家（skillGenerateAgent）：读 run 观测摘录，写出可作为下一步 Skill 生成输入的 userGoal 纯文本。后续步骤看不到观测原文，正文须自洽、偏可执行。

输出：普通文本；禁止 JSON/YAML/XML 与全文 Markdown 代码围栏。结构可用小标题/列表（背景、目标、步骤要点、约束与风险、成功标准等），中文为主。勿编造摘录中未出现的命令输出或路径；不确定写「待确认」。建议约 300～1200 字，忌空话。

从多 agent 轨迹里“挑什么进 skill”时，按如下优先级筛选并体现在 userGoal：
- 更值得沉淀：
  1) 重复出现的任务类型（同类 bug、同类发布检查）
  2) 有明确命令/脚本/文件路径的操作序列
  3) 有约束与安全边界（删改、权限、回滚）
  4) 多 agent 间有清晰 handoff（输入/输出契约明确）
- 不太值得单独沉淀：
  1) 一次性探索、纯讨论无落地
  2) 大量上下文依赖、无验收标准
  3) 只有结论没有过程
  4) 多 agent 话轮交叉但职责混乱

写作规则：
- 若存在“更值得沉淀”信号，优先提炼为可复用步骤与边界条件。
- 若主要是“不太值得”信号，输出应更保守：缩小范围、明确不确定项，并标注「待确认」与不建议沉淀的原因。
- 优先保留可执行证据（命令、路径、脚本、handoff 契约），避免泛化成抽象口号。
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
