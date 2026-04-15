import type Database from "better-sqlite3";
import type { AgenticEvent } from "@agentic/shared";
import { listEvents } from "../store.js";
import { buildObservationContext, capEventsByTail, filterEventsByAgents, summarizeKinds } from "./aggregateObservations.js";
import { SkillGenerateError } from "./errors.js";

/** Plan 默认尾部窗口；需更长上下文可在请求体传 maxContextEvents */
export const DEFAULT_MAX_CONTEXT_EVENTS = 100;

export function buildInputWarnings(params: {
  filteredEvents: number;
  selectedEvents: number;
  kindSummary: string;
  requestedAgentIds?: string[];
  selectedAgentIds: string[];
}): string[] {
  const warnings: string[] = [];
  if (params.selectedEvents < 8) {
    warnings.push("纳入的观测事件较少（<8），生成结果可能不够稳定");
  }
  const kinds = new Set(params.kindSummary.split(",").map((x) => x.trim().split(":")[0]).filter(Boolean));
  if (kinds.size < 2) {
    warnings.push("观测事件类型覆盖较窄，建议包含 cli/llm/meta 中至少两类");
  }
  if (params.requestedAgentIds && params.requestedAgentIds.length > 0) {
    const missed = params.requestedAgentIds.filter((id) => !params.selectedAgentIds.includes(id));
    if (missed.length > 0) {
      warnings.push(`以下 agentIds 未命中任何观测事件：${missed.join(", ")}`);
    }
  }
  if (params.selectedEvents < params.filteredEvents) {
    warnings.push(`当前仅使用末尾 ${params.selectedEvents} 条上下文，请人工确认关键前序步骤未被裁剪`);
  }
  return warnings;
}

export type RunObservationPackage = {
  capped: AgenticEvent[];
  filtered: AgenticEvent[];
  observationSummary: string;
  kindSummary: string;
  selectedAgentIds: string[];
  maxN: number;
};

export function buildRunObservationPackage(
  db: Database.Database,
  runId: string,
  params: { agentIds?: string[]; maxContextEvents?: number },
): RunObservationPackage {
  const all = listEvents(db, runId, {});
  const filtered = filterEventsByAgents(all, params.agentIds);
  const maxN = params.maxContextEvents ?? DEFAULT_MAX_CONTEXT_EVENTS;
  const capped = capEventsByTail(filtered, maxN);
  if (capped.length === 0) {
    throw new SkillGenerateError(400, "no_events", "该 Run 在筛选条件下没有可用观测事件");
  }
  const observationSummary = buildObservationContext(capped);
  const kindSummary = summarizeKinds(capped);
  const selectedAgentIds = Array.from(new Set(capped.map((e) => e.agentId)));
  return { capped, filtered, observationSummary, kindSummary, selectedAgentIds, maxN };
}
