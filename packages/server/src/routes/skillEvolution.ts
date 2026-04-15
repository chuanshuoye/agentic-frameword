import {
  API_PREFIX,
  apiPaths,
  runtimeMatchRequestSchema,
  scorecardResponseSchema,
  skillExperimentListResponseSchema,
  skillFeedbackTrendResponseSchema,
  skillEvalRunCreateBodySchema,
  skillExperimentCreateBodySchema,
  skillRollbackBodySchema,
  skillRuntimeFeedbackCreateBodySchema,
} from "@agentic/shared";
import type { MiddlewareHandler } from "hono";
import type { Hono } from "hono";
import type { AppEnv } from "../appEnv.js";
import {
  createSkillEvalRun,
  createSkillExperiment,
  createSkillRuntimeFeedback,
  getSkillRecord,
  getSkillFeedbackTrend,
  getSkillScorecard,
  listSkillExperiments,
  pickRuntimeSkill,
  rollbackSkillRelease,
} from "../store.js";

export function registerSkillEvolutionRoutes(app: Hono<AppEnv>, auth: MiddlewareHandler): void {
  app.post(apiPaths.skillFeedback, auth, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = skillRuntimeFeedbackCreateBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    const skill = getSkillRecord(c.get("db"), parsed.data.skillRecordId);
    if (!skill) {
      return c.json({ error: "skill_not_found" }, 404);
    }
    const { id } = createSkillRuntimeFeedback(c.get("db"), parsed.data);
    return c.json({ ok: true, id }, 201);
  });

  app.post(`${API_PREFIX}/skills/:id/experiments`, auth, async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id < 1) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = skillExperimentCreateBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    if (parsed.data.candidateSkillRecordId !== id) {
      return c.json({ error: "candidate_mismatch" }, 400);
    }
    const { id: experimentId } = createSkillExperiment(c.get("db"), parsed.data);
    return c.json({ ok: true, experimentId }, 201);
  });

  app.get(`${API_PREFIX}/skills/:id/experiments`, auth, async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id < 1) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const skill = getSkillRecord(c.get("db"), id);
    if (!skill) {
      return c.json({ error: "not_found" }, 404);
    }
    const experiments = listSkillExperiments(c.get("db"), id);
    return c.json(skillExperimentListResponseSchema.parse({ experiments }));
  });

  app.post(`${API_PREFIX}/skills/:id/evals`, auth, async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id < 1) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = skillEvalRunCreateBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    if (parsed.data.skillRecordId !== id) {
      return c.json({ error: "skill_id_mismatch" }, 400);
    }
    const { id: evalId } = createSkillEvalRun(c.get("db"), parsed.data);
    return c.json({ ok: true, evalId }, 201);
  });

  app.get(`${API_PREFIX}/skills/:id/scorecard`, auth, async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id < 1) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const skill = getSkillRecord(c.get("db"), id);
    if (!skill) {
      return c.json({ error: "not_found" }, 404);
    }
    const scorecard = getSkillScorecard(c.get("db"), id);
    return c.json(scorecardResponseSchema.parse(scorecard));
  });

  app.get(`${API_PREFIX}/skills/:id/feedback-trend`, auth, async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id < 1) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const skill = getSkillRecord(c.get("db"), id);
    if (!skill) {
      return c.json({ error: "not_found" }, 404);
    }
    const q = Number(c.req.query("windowDays") ?? "7");
    const points = getSkillFeedbackTrend(c.get("db"), id, Number.isFinite(q) ? q : 7);
    return c.json(skillFeedbackTrendResponseSchema.parse({ points }));
  });

  app.post(`${API_PREFIX}/skills/:id/rollback`, auth, async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id < 1) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = skillRollbackBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    const { id: releaseId } = rollbackSkillRelease(c.get("db"), id, parsed.data);
    return c.json({ ok: true, releaseId }, 201);
  });

  app.post(apiPaths.skillRuntimeMatch, auth, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = runtimeMatchRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    const matched = pickRuntimeSkill(c.get("db"), parsed.data);
    return c.json(matched);
  });
}
