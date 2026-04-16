import {
  HARNESS_SKILL_AGENT_ID,
  harnessSkillAgentDefinition,
  type HarnessSkillAgentDefinition,
} from "./agents/harnessSkillAgent.js";
import {
  SKILL_GENERATE_AGENT_ID,
  skillGenerateAgentDefinition,
  type SkillGenerateAgentDefinition,
} from "./agents/skillGenerateAgent.js";

export type BuiltinSkillAgentDefinition = SkillGenerateAgentDefinition | HarnessSkillAgentDefinition;

const agents: Record<string, BuiltinSkillAgentDefinition> = {
  [HARNESS_SKILL_AGENT_ID]: harnessSkillAgentDefinition,
  [SKILL_GENERATE_AGENT_ID]: skillGenerateAgentDefinition,
};
const skillPlanAgents: Record<string, SkillGenerateAgentDefinition> = {
  [SKILL_GENERATE_AGENT_ID]: skillGenerateAgentDefinition,
};
const harnessReviewAgents: Record<string, HarnessSkillAgentDefinition> = {
  [HARNESS_SKILL_AGENT_ID]: harnessSkillAgentDefinition,
};

export const DEFAULT_SKILL_PLAN_AGENT_ID = SKILL_GENERATE_AGENT_ID;
export const DEFAULT_HARNESS_REVIEW_AGENT_ID = HARNESS_SKILL_AGENT_ID;

export function listSkillAgents(): BuiltinSkillAgentDefinition[] {
  return Object.values(agents);
}

export function getSkillAgent(id: string): BuiltinSkillAgentDefinition | undefined {
  return agents[id];
}

export function getSkillPlanAgent(id: string): SkillGenerateAgentDefinition | undefined {
  return skillPlanAgents[id];
}

export function getHarnessReviewAgent(id: string): HarnessSkillAgentDefinition | undefined {
  return harnessReviewAgents[id];
}
