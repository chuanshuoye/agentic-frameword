import {
  API_PREFIX,
  apiPaths,
  type CursorProjectCandidate,
  type RunRow,
  type SessionDetail,
  type SessionDistillRequest,
  type SessionDistillResult,
  type SessionRow,
  type SessionsSyncToRunsResponse,
  type GovernanceDetailResponse,
  type HumanFeedbackCreateBody,
  type HumanFeedbackListResponse,
  type RegenerateFromFeedbackBody,
  type RuntimeMatchRequest,
  type RuntimeMatchResponse,
  type ScorecardResponse,
  type SkillExperimentListResponse,
  type SkillFeedbackTrendResponse,
  type SkillVersionListResponse,
  type SkillExperimentCreateBody,
  type SkillReviewCreateBody,
  type SkillRollbackBody,
  type SkillRuntimeFeedbackCreateBody,
  type SkillGenerateRequest,
  type SkillGenerateResponse,
  type SkillPlanRequest,
  type SkillRecordCreateBody,
  type SkillRecordCreateResponse,
  type SkillRecordDetail,
  type SkillRecordListItem,
  type StoredEvent,
} from "@agentic/shared";

const rawBase = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8787";

export const apiBase = rawBase.replace(/\/$/, "");

export type {
  RunRow,
  StoredEvent,
  SessionRow,
  SessionDetail,
  CursorProjectCandidate,
  SessionDistillResult,
} from "@agentic/shared";

export type SessionDistillRequestBody = SessionDistillRequest;
export type SessionsSyncToRunsResult = SessionsSyncToRunsResponse;

export type { SkillRecordListItem, SkillRecordDetail, SkillRecordCreateBody, SkillRecordCreateResponse };
export type {
  GovernanceDetailResponse,
  HumanFeedbackCreateBody,
  HumanFeedbackListResponse,
  RegenerateFromFeedbackBody,
  ScorecardResponse,
  SkillExperimentListResponse,
  SkillFeedbackTrendResponse,
  SkillVersionListResponse,
  SkillReviewCreateBody,
  SkillExperimentCreateBody,
  SkillRuntimeFeedbackCreateBody,
  SkillRollbackBody,
  RuntimeMatchRequest,
  RuntimeMatchResponse,
};

function toApiError(prefix: string, status: number, details?: string): Error {
  if (details) {
    return new Error(`${prefix}_${status}:${details.slice(0, 200)}`);
  }
  return new Error(`${prefix}_${status}`);
}

export async function fetchRuns(limit = 50): Promise<RunRow[]> {
  const res = await fetch(`${apiBase}${apiPaths.runs}?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`runs_${res.status}`);
  }
  const data = (await res.json()) as { runs: RunRow[] };
  return data.runs;
}

export async function fetchEvents(
  runId: string,
  opts: { sinceSeq?: number; agentId?: string } = {},
): Promise<StoredEvent[]> {
  const q = new URLSearchParams();
  if (opts.sinceSeq !== undefined) {
    q.set("sinceSeq", String(opts.sinceSeq));
  }
  if (opts.agentId) {
    q.set("agentId", opts.agentId);
  }
  const suffix = q.toString() ? `?${q.toString()}` : "";
  const res = await fetch(`${apiBase}${apiPaths.runEvents(runId)}${suffix}`);
  if (!res.ok) {
    throw new Error(`events_${res.status}`);
  }
  const data = (await res.json()) as { events: StoredEvent[] };
  return data.events;
}

const ingestToken = (import.meta.env.VITE_AGENTIC_SERVER_TOKEN as string | undefined)?.trim() ?? "";

export async function planSkill(runId: string, body: SkillPlanRequest): Promise<string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (ingestToken) {
    headers.authorization = `Bearer ${ingestToken}`;
  }
  const res = await fetch(`${apiBase}${apiPaths.runSkillPlan(runId)}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`skill_plan_${res.status}:${text.slice(0, 200)}`);
  }
  return text;
}

export async function generateSkill(
  runId: string,
  body: SkillGenerateRequest,
): Promise<SkillGenerateResponse> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (ingestToken) {
    headers.authorization = `Bearer ${ingestToken}`;
  }
  const res = await fetch(`${apiBase}${apiPaths.runSkillGenerate(runId)}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`skill_${res.status}:${text.slice(0, 200)}`);
  }
  return (await res.json()) as SkillGenerateResponse;
}

function authHeadersJson(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (ingestToken) {
    headers.authorization = `Bearer ${ingestToken}`;
  }
  return headers;
}

export async function saveSkillRecords(body: SkillRecordCreateBody): Promise<SkillRecordCreateResponse> {
  const res = await fetch(`${apiBase}${apiPaths.skills}`, {
    method: "POST",
    headers: authHeadersJson(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`skill_save_${res.status}:${text.slice(0, 240)}`);
  }
  return (await res.json()) as SkillRecordCreateResponse;
}

export async function fetchSkillRecords(opts: {
  limit?: number;
  runId?: string;
  format?: string;
} = {}): Promise<SkillRecordListItem[]> {
  const q = new URLSearchParams();
  q.set("limit", String(opts.limit ?? 50));
  if (opts.runId) {
    q.set("runId", opts.runId);
  }
  if (opts.format) {
    q.set("format", opts.format);
  }
  const res = await fetch(`${apiBase}${apiPaths.skills}?${q.toString()}`, {
    headers: ingestToken ? { authorization: `Bearer ${ingestToken}` } : {},
  });
  if (!res.ok) {
    throw new Error(`skills_list_${res.status}`);
  }
  const data = (await res.json()) as { skills: SkillRecordListItem[] };
  return data.skills;
}

export async function fetchSkillRecord(id: number): Promise<SkillRecordDetail> {
  const res = await fetch(`${apiBase}${apiPaths.skill(id)}`, {
    headers: ingestToken ? { authorization: `Bearer ${ingestToken}` } : {},
  });
  if (!res.ok) {
    throw new Error(`skill_detail_${res.status}`);
  }
  const data = (await res.json()) as { skill: SkillRecordDetail };
  return data.skill;
}

export async function fetchSkillGovernance(id: number): Promise<GovernanceDetailResponse> {
  const res = await fetch(`${apiBase}${apiPaths.skillGovernance(id)}`, {
    headers: ingestToken ? { authorization: `Bearer ${ingestToken}` } : {},
  });
  if (!res.ok) {
    throw toApiError("skill_governance", res.status);
  }
  return (await res.json()) as GovernanceDetailResponse;
}

export async function reviewSkill(id: number, body: SkillReviewCreateBody): Promise<{ ok: true; reviewId: number }> {
  const res = await fetch(`${apiBase}${apiPaths.skillReview(id)}`, {
    method: "POST",
    headers: authHeadersJson(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`skill_review_${res.status}:${text.slice(0, 200)}`);
  }
  return (await res.json()) as { ok: true; reviewId: number };
}

export async function releaseSkill(
  id: number,
  body: { channel: string; approvedBy: string },
): Promise<{ ok: true; releaseId: number }> {
  const res = await fetch(`${apiBase}${apiPaths.skillRelease(id)}`, {
    method: "POST",
    headers: authHeadersJson(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`skill_release_${res.status}:${text.slice(0, 200)}`);
  }
  return (await res.json()) as { ok: true; releaseId: number };
}

export async function createSkillExperiment(
  id: number,
  body: SkillExperimentCreateBody,
): Promise<{ ok: true; experimentId: number }> {
  const res = await fetch(`${apiBase}${apiPaths.skillExperiment(id)}`, {
    method: "POST",
    headers: authHeadersJson(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`skill_experiment_${res.status}:${text.slice(0, 200)}`);
  }
  return (await res.json()) as { ok: true; experimentId: number };
}

export async function createSkillRuntimeFeedback(
  body: SkillRuntimeFeedbackCreateBody,
): Promise<{ ok: true; id: number }> {
  const res = await fetch(`${apiBase}${apiPaths.skillFeedback}`, {
    method: "POST",
    headers: authHeadersJson(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`skill_feedback_${res.status}:${text.slice(0, 200)}`);
  }
  return (await res.json()) as { ok: true; id: number };
}

export async function fetchSkillScorecard(id: number): Promise<ScorecardResponse> {
  const res = await fetch(`${apiBase}${apiPaths.skillScorecard(id)}`, {
    headers: ingestToken ? { authorization: `Bearer ${ingestToken}` } : {},
  });
  if (!res.ok) {
    throw toApiError("skill_scorecard", res.status);
  }
  return (await res.json()) as ScorecardResponse;
}

export async function fetchSkillExperiments(id: number): Promise<SkillExperimentListResponse["experiments"]> {
  const res = await fetch(`${apiBase}${apiPaths.skillExperiment(id)}`, {
    headers: ingestToken ? { authorization: `Bearer ${ingestToken}` } : {},
  });
  if (!res.ok) {
    throw toApiError("skill_experiments", res.status);
  }
  const data = (await res.json()) as SkillExperimentListResponse;
  return data.experiments;
}

export async function fetchSkillFeedbackTrend(
  id: number,
  windowDays: 7 | 30 | 90,
): Promise<SkillFeedbackTrendResponse["points"]> {
  const res = await fetch(`${apiBase}${apiPaths.skillFeedbackTrend(id)}?windowDays=${windowDays}`, {
    headers: ingestToken ? { authorization: `Bearer ${ingestToken}` } : {},
  });
  if (!res.ok) {
    throw toApiError("skill_feedback_trend", res.status);
  }
  const data = (await res.json()) as SkillFeedbackTrendResponse;
  return data.points;
}

export async function fetchSkillHumanFeedback(
  id: number,
  limit = 50,
): Promise<HumanFeedbackListResponse["feedback"]> {
  const res = await fetch(`${apiBase}${apiPaths.skillHumanFeedback(id)}?limit=${limit}`, {
    headers: ingestToken ? { authorization: `Bearer ${ingestToken}` } : {},
  });
  if (!res.ok) {
    throw toApiError("skill_human_feedback", res.status);
  }
  const data = (await res.json()) as HumanFeedbackListResponse;
  return data.feedback;
}

export async function createSkillHumanFeedback(
  id: number,
  body: HumanFeedbackCreateBody,
): Promise<{ ok: true; id: number }> {
  const res = await fetch(`${apiBase}${apiPaths.skillHumanFeedback(id)}`, {
    method: "POST",
    headers: authHeadersJson(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw toApiError("create_skill_human_feedback", res.status, text);
  }
  return (await res.json()) as { ok: true; id: number };
}

export async function fetchSkillVersions(id: number): Promise<SkillVersionListResponse["versions"]> {
  const res = await fetch(`${apiBase}${apiPaths.skillVersions(id)}`, {
    headers: ingestToken ? { authorization: `Bearer ${ingestToken}` } : {},
  });
  if (!res.ok) {
    throw toApiError("skill_versions", res.status);
  }
  const data = (await res.json()) as SkillVersionListResponse;
  return data.versions;
}

export async function regenerateSkillFromFeedback(
  id: number,
  body: RegenerateFromFeedbackBody,
): Promise<{ ok: true; id: number; version: number }> {
  const res = await fetch(`${apiBase}${apiPaths.skillRegenerateFromFeedback(id)}`, {
    method: "POST",
    headers: authHeadersJson(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw toApiError("skill_regenerate_from_feedback", res.status, text);
  }
  return (await res.json()) as { ok: true; id: number; version: number };
}

export async function rollbackSkill(
  id: number,
  body: SkillRollbackBody,
): Promise<{ ok: true; releaseId: number }> {
  const res = await fetch(`${apiBase}${apiPaths.skillRollback(id)}`, {
    method: "POST",
    headers: authHeadersJson(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`skill_rollback_${res.status}:${text.slice(0, 200)}`);
  }
  return (await res.json()) as { ok: true; releaseId: number };
}

export async function runtimeMatchSkill(
  body: RuntimeMatchRequest,
): Promise<RuntimeMatchResponse> {
  const res = await fetch(`${apiBase}${apiPaths.skillRuntimeMatch}`, {
    method: "POST",
    headers: authHeadersJson(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`skill_runtime_match_${res.status}:${text.slice(0, 200)}`);
  }
  return (await res.json()) as RuntimeMatchResponse;
}

export function openEventsStream(
  runId: string,
  opts: { sinceSeq?: number; agentId?: string } = {},
): EventSource {
  const q = new URLSearchParams({ runId });
  if (opts.sinceSeq !== undefined) {
    q.set("sinceSeq", String(opts.sinceSeq));
  }
  if (opts.agentId) {
    q.set("agentId", opts.agentId);
  }
  return new EventSource(`${apiBase}${API_PREFIX}/events/stream?${q.toString()}`);
}

export async function fetchSessions(params: {
  q?: string;
  projectKey?: string;
  agentId?: string;
  limit?: number;
  offset?: number;
}): Promise<SessionRow[]> {
  const q = new URLSearchParams();
  if (params.q) {
    q.set("q", params.q);
  }
  if (params.projectKey) {
    q.set("projectKey", params.projectKey);
  }
  if (params.agentId) {
    q.set("agentId", params.agentId);
  }
  q.set("limit", String(params.limit ?? 100));
  q.set("offset", String(params.offset ?? 0));
  const res = await fetch(`${apiBase}${apiPaths.sessions}?${q.toString()}`);
  if (!res.ok) {
    throw new Error(`sessions_${res.status}`);
  }
  const data = (await res.json()) as { sessions: SessionRow[] };
  return data.sessions;
}

export async function fetchSessionDetail(id: number): Promise<SessionDetail> {
  const res = await fetch(`${apiBase}${apiPaths.session(id)}`);
  if (!res.ok) {
    throw new Error(`session_${res.status}`);
  }
  const data = (await res.json()) as { session: SessionDetail };
  return data.session;
}

export async function syncSessions(params: {
  projectName?: string;
  transcriptsDir?: string;
} = {}): Promise<{
  scannedFiles: number;
  inserted: number;
  updated: number;
  skipped: number;
}> {
  const headers: Record<string, string> = {};
  if (ingestToken) {
    headers.authorization = `Bearer ${ingestToken}`;
  }
  const res = await fetch(`${apiBase}${apiPaths.sessionsSync}`, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sessions_sync_${res.status}:${text.slice(0, 200)}`);
  }
  return (await res.json()) as {
    scannedFiles: number;
    inserted: number;
    updated: number;
    skipped: number;
  };
}

export async function fetchCursorProjects(projectName?: string): Promise<CursorProjectCandidate[]> {
  const q = new URLSearchParams();
  if (projectName?.trim()) {
    q.set("projectName", projectName.trim());
  }
  const suffix = q.toString() ? `?${q.toString()}` : "";
  const res = await fetch(`${apiBase}${apiPaths.sessionsCursorProjects}${suffix}`);
  if (!res.ok) {
    throw new Error(`cursor_projects_${res.status}`);
  }
  const data = (await res.json()) as { projects: CursorProjectCandidate[] };
  return data.projects;
}

export async function distillSessions(body: SessionDistillRequestBody): Promise<SessionDistillResult> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (ingestToken) {
    headers.authorization = `Bearer ${ingestToken}`;
  }
  const res = await fetch(`${apiBase}${apiPaths.sessionsDistill}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sessions_distill_${res.status}:${text.slice(0, 300)}`);
  }
  return (await res.json()) as SessionDistillResult;
}

export async function syncSessionsToRuns(sessionIds: number[]): Promise<SessionsSyncToRunsResult> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (ingestToken) {
    headers.authorization = `Bearer ${ingestToken}`;
  }
  const res = await fetch(`${apiBase}${apiPaths.sessionsSyncToRuns}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ sessionIds, granularity: "section" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sessions_sync_to_runs_${res.status}:${text.slice(0, 300)}`);
  }
  return (await res.json()) as SessionsSyncToRunsResult;
}

export async function deleteSessions(ids: number[]): Promise<{ deleted: number; cleanedProjects: number }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (ingestToken) {
    headers.authorization = `Bearer ${ingestToken}`;
  }
  const res = await fetch(`${apiBase}${apiPaths.sessionsBatchDelete}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sessions_delete_${res.status}:${text.slice(0, 200)}`);
  }
  return (await res.json()) as { deleted: number; cleanedProjects: number };
}
