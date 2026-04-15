import {
  API_PREFIX,
  apiPaths,
  skillRecordCreateBodySchema,
  skillRecordCreateResponseSchema,
  skillRecordPatchBodySchema,
} from "@agentic/shared";
import type { MiddlewareHandler } from "hono";
import type { Hono } from "hono";
import type { AppEnv } from "../appEnv.js";
import {
  createPolicyHitsForSkill,
  getRun,
  getSkillRecord,
  listSkillRecords,
  saveSkillBundlesAsRecords,
  updateSkillRecordStatus,
} from "../store.js";

export function registerSkillRoutes(app: Hono<AppEnv>, auth: MiddlewareHandler): void {
  app.post(apiPaths.skills, auth, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = skillRecordCreateBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    const dbInstance = c.get("db");
    const { runId, bundles, generationMeta } = parsed.data;
    if (runId) {
      const run = getRun(dbInstance, runId);
      if (!run) {
        return c.json({ error: "run_not_found", message: `runId 不存在: ${runId}` }, 400);
      }
    }
    try {
      const { ids } = saveSkillBundlesAsRecords(dbInstance, {
        runId,
        bundles,
        generationMeta,
      });
      for (const id of ids) {
        createPolicyHitsForSkill(dbInstance, id, { runId: runId ?? null });
      }
      const payload = skillRecordCreateResponseSchema.parse({ ok: true as const, ids });
      return c.json(payload, 201);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ error: "skill_save_failed", message }, 500);
    }
  });

  app.get(apiPaths.skills, auth, async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? "50") || 50, 200);
    const runId = c.req.query("runId") ?? undefined;
    const format = c.req.query("format") ?? undefined;
    const skills = listSkillRecords(c.get("db"), { limit, runId, format });
    return c.json({ skills });
  });

  app.get(`${API_PREFIX}/skills/:id`, auth, async (c) => {
    const idRaw = c.req.param("id");
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id < 1) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const row = getSkillRecord(c.get("db"), id);
    if (!row) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ skill: row });
  });

  app.patch(`${API_PREFIX}/skills/:id`, auth, async (c) => {
    const idRaw = c.req.param("id");
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id < 1) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = skillRecordPatchBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    const existing = getSkillRecord(c.get("db"), id);
    if (!existing) {
      return c.json({ error: "not_found" }, 404);
    }
    const { changes } = updateSkillRecordStatus(c.get("db"), id, parsed.data.status);
    if (changes === 0) {
      return c.json({ error: "update_failed" }, 500);
    }
    const updated = getSkillRecord(c.get("db"), id);
    return c.json({ skill: updated });
  });
}
