import {
  SKILL_GENERATE_AGENT_ID,
  skillGenerateAgentDefinition,
  type SkillGenerateAgentDefinition,
} from "./agents/skillGenerateAgent.js";

export type BuiltinSkillAgentDefinition = SkillGenerateAgentDefinition;

const agents: Record<string, BuiltinSkillAgentDefinition> = {
  [SKILL_GENERATE_AGENT_ID]: skillGenerateAgentDefinition,
};

export const DEFAULT_SKILL_PLAN_AGENT_ID = SKILL_GENERATE_AGENT_ID;

export function listSkillAgents(): BuiltinSkillAgentDefinition[] {
  return Object.values(agents);
}

export function getSkillAgent(id: string): BuiltinSkillAgentDefinition | undefined {
  return agents[id];
}
