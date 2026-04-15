export const API_PREFIX = "/v1";

export const apiPaths = {
  ingestBatch: `${API_PREFIX}/ingest/batch`,
  runs: `${API_PREFIX}/runs`,
  run: (runId: string) => `${API_PREFIX}/runs/${encodeURIComponent(runId)}`,
  runEvents: (runId: string) =>
    `${API_PREFIX}/runs/${encodeURIComponent(runId)}/events`,
  runSkillGenerate: (runId: string) =>
    `${API_PREFIX}/runs/${encodeURIComponent(runId)}/skill/generate`,
  runSkillPlan: (runId: string) =>
    `${API_PREFIX}/runs/${encodeURIComponent(runId)}/skill/plan`,
  eventsStream: `${API_PREFIX}/events/stream`,
  sessions: `${API_PREFIX}/sessions`,
  session: (id: number) => `${API_PREFIX}/sessions/${id}`,
  sessionsSync: `${API_PREFIX}/sessions/sync`,
  sessionsBatchDelete: `${API_PREFIX}/sessions/batch-delete`,
  sessionsDistill: `${API_PREFIX}/sessions/distill`,
  sessionsSyncToRuns: `${API_PREFIX}/sessions/sync-to-runs`,
  sessionsCursorProjects: `${API_PREFIX}/sessions/cursor-projects`,
  skills: `${API_PREFIX}/skills`,
  skill: (id: string | number) =>
    `${API_PREFIX}/skills/${encodeURIComponent(String(id))}`,
  skillGovernance: (id: string | number) =>
    `${API_PREFIX}/skills/${encodeURIComponent(String(id))}/governance`,
  skillReview: (id: string | number) =>
    `${API_PREFIX}/skills/${encodeURIComponent(String(id))}/review`,
  skillRelease: (id: string | number) =>
    `${API_PREFIX}/skills/${encodeURIComponent(String(id))}/release`,
  skillExperiment: (id: string | number) =>
    `${API_PREFIX}/skills/${encodeURIComponent(String(id))}/experiments`,
  skillFeedbackTrend: (id: string | number) =>
    `${API_PREFIX}/skills/${encodeURIComponent(String(id))}/feedback-trend`,
  skillScorecard: (id: string | number) =>
    `${API_PREFIX}/skills/${encodeURIComponent(String(id))}/scorecard`,
  skillRollback: (id: string | number) =>
    `${API_PREFIX}/skills/${encodeURIComponent(String(id))}/rollback`,
  skillFeedback: `${API_PREFIX}/skills/feedback`,
  skillHumanFeedback: (id: string | number) =>
    `${API_PREFIX}/skills/${encodeURIComponent(String(id))}/human-feedback`,
  skillRegenerateFromFeedback: (id: string | number) =>
    `${API_PREFIX}/skills/${encodeURIComponent(String(id))}/regenerate-from-feedback`,
  skillVersions: (id: string | number) =>
    `${API_PREFIX}/skills/${encodeURIComponent(String(id))}/versions`,
  skillRuntimeMatch: `${API_PREFIX}/skills/runtime/match`,
  runReviews: (runId: string) =>
    `${API_PREFIX}/runs/${encodeURIComponent(runId)}/reviews`,
} as const;
