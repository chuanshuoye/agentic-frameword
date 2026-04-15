export function skillLlmBaseUrl(): string {
  /** 与官方文档一致；实际请求路径见 llm.ts 对 api.deepseek.com 的规范化 */
  return (process.env.AGENTIC_SKILL_LLM_BASE_URL ?? "https://api.deepseek.com").trim();
}

export function skillLlmApiKeyFromEnv(): string {
  return (process.env.AGENTIC_SKILL_LLM_API_KEY ?? "").trim();
}

export function skillLlmModel(): string {
  return (process.env.AGENTIC_SKILL_LLM_MODEL ?? "deepseek-chat").trim();
}

export function skillPlanLlmBaseUrl(): string {
  return (process.env.AGENTIC_SKILL_PLAN_LLM_BASE_URL ?? skillLlmBaseUrl()).trim();
}

export function skillPlanLlmApiKeyFromEnv(): string {
  return (process.env.AGENTIC_SKILL_PLAN_LLM_API_KEY ?? skillLlmApiKeyFromEnv()).trim();
}

export function skillPlanLlmModel(): string {
  return (process.env.AGENTIC_SKILL_PLAN_LLM_MODEL ?? skillLlmModel()).trim();
}

export function sessionDistillLlmBaseUrl(): string {
  return (process.env.AGENTIC_SESSION_DISTILL_LLM_BASE_URL ?? skillLlmBaseUrl()).trim();
}

export function sessionDistillLlmApiKeyFromEnv(): string {
  return (process.env.AGENTIC_SESSION_DISTILL_LLM_API_KEY ?? skillLlmApiKeyFromEnv()).trim();
}

export function sessionDistillLlmModel(): string {
  return (process.env.AGENTIC_SESSION_DISTILL_LLM_MODEL ?? skillLlmModel()).trim();
}
