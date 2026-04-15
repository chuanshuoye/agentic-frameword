import {
  API_PREFIX,
  humanFeedbackCreateBodySchema,
  humanFeedbackListResponseSchema,
  regenerateFromFeedbackBodySchema,
  skillVersionListResponseSchema,
} from "@agentic/shared";
import type { MiddlewareHandler } from "hono";
import type { Hono } from "hono";
import type { AppEnv } from "../appEnv.js";
import {
  createRegeneratedSkillDraftFromFeedback,
  createSkillHumanFeedback,
  getSkillRecord,
  listSkillHumanFeedback,
  listSkillVersions,
} from "../store.js";

export function registerSkillFeedbackRoutes(app: Hono<AppEnv>, auth: MiddlewareHandler): void {
  app.post(`${API_PREFIX}/skills/:id/human-feedback`, auth, async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id < 1) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const skill = getSkillRecord(c.get("db"), id);
    if (!skill) {
      return c.json({ error: "not_found" }, 404);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = humanFeedbackCreateBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    const result = createSkillHumanFeedback(c.get("db"), id, parsed.data);
    return c.json({ ok: true, id: result.id }, 201);
  });

  app.get(`${API_PREFIX}/skills/:id/human-feedback`, auth, async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id < 1) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const skill = getSkillRecord(c.get("db"), id);
    if (!skill) {
      return c.json({ error: "not_found" }, 404);
    }
    const limit = Math.min(Number(c.req.query("limit") ?? "50") || 50, 200);
    const feedback = listSkillHumanFeedback(c.get("db"), id, limit);
    return c.json(humanFeedbackListResponseSchema.parse({ feedback }));
  });

  app.post(`${API_PREFIX}/skills/:id/regenerate-from-feedback`, auth, async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id < 1) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const skill = getSkillRecord(c.get("db"), id);
    if (!skill) {
      return c.json({ error: "not_found" }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    const parsed = regenerateFromFeedbackBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    try {
      const draft = createRegeneratedSkillDraftFromFeedback(c.get("db"), id, parsed.data);
      return c.json({ ok: true, id: draft.id, version: draft.version }, 201);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ error: "regenerate_failed", message }, 500);
    }
  });

  app.get(`${API_PREFIX}/skills/:id/versions`, auth, async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id < 1) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const skill = getSkillRecord(c.get("db"), id);
    if (!skill) {
      return c.json({ error: "not_found" }, 404);
    }
    const versions = listSkillVersions(c.get("db"), id);
    return c.json(skillVersionListResponseSchema.parse({ versions }));
  });
}
