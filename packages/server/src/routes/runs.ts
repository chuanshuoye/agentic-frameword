import {
  API_PREFIX,
  apiPaths,
  runReviewCreateBodySchema,
  skillGenerateRequestSchema,
  skillPlanRequestSchema,
} from "@agentic/shared";
import type { MiddlewareHandler } from "hono";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppEnv } from "../appEnv.js";
import { generateSkillFromRun } from "../skill/generate.js";
import { planSkillUserGoalFromRun } from "../skill/plan.js";
import { SkillGenerateError } from "../skill/errors.js";
import { getRun, listEvents, listRuns } from "../store.js";

export function registerRunRoutes(app: Hono<AppEnv>, auth: MiddlewareHandler): void {
  app.get(apiPaths.runs, async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? "50") || 50, 200);
    const rows = listRuns(c.get("db"), limit);
    return c.json({ runs: rows });
  });

  app.get(`${API_PREFIX}/runs/:runId`, async (c) => {
    const runId = c.req.param("runId");
    const run = getRun(c.get("db"), runId);
    if (!run) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ run });
  });

  app.post(`${API_PREFIX}/runs/:runId/skill/plan`, auth, async (c) => {
    const runId = c.req.param("runId");
    if (!runId) {
      return c.json({ error: "invalid_runId" }, 400);
    }
    const body = await c.req.json().catch(() => ({}));
    const parsed = skillPlanRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    const dbInstance = c.get("db");
    const run = getRun(dbInstance, runId);
    if (!run) {
      return c.json({ error: "not_found" }, 404);
    }
    try {
      const text = await planSkillUserGoalFromRun(dbInstance, runId, parsed.data);
      return c.text(text, 200);
    } catch (e) {
      if (e instanceof SkillGenerateError) {
        const status = e.status as 400 | 422 | 502 | 503;
        return c.json({ error: e.code, message: e.message }, status);
      }
      throw e;
    }
  });

  app.post(`${API_PREFIX}/runs/:runId/skill/generate`, auth, async (c) => {
    const runId = c.req.param("runId");
    if (!runId) {
      return c.json({ error: "invalid_runId" }, 400);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = skillGenerateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    const dbInstance = c.get("db");
    try {
      const result = await generateSkillFromRun(dbInstance, runId, parsed.data);
      return c.json(result);
    } catch (e) {
      if (e instanceof SkillGenerateError) {
        const status = e.status as 400 | 422 | 502 | 503;
        return c.json({ error: e.code, message: e.message }, status);
      }
      throw e;
    }
  });

  app.post(`${API_PREFIX}/runs/:runId/reviews`, auth, async (c) => {
    const runId = c.req.param("runId");
    if (!runId) {
      return c.json({ error: "invalid_runId" }, 400);
    }
    const body = await c.req.json().catch(() => ({}));
    const parsed = runReviewCreateBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    const dbInstance = c.get("db");
    const run = getRun(dbInstance, runId);
    if (!run) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json(
      {
        error: "not_implemented",
        message: "复盘结构化写入尚未实现（二期占位接口）",
      },
      501,
    );
  });

  app.get(`${API_PREFIX}/runs/:runId/events`, async (c) => {
    const runId = c.req.param("runId");
    const sinceSeq = c.req.query("sinceSeq");
    const agentId = c.req.query("agentId") ?? undefined;
    const parsedSince =
      sinceSeq === undefined || sinceSeq === "" ? undefined : Number(sinceSeq);
    if (parsedSince !== undefined && Number.isNaN(parsedSince)) {
      return c.json({ error: "invalid_sinceSeq" }, 400);
    }
    const events = listEvents(c.get("db"), runId, {
      sinceSeq: parsedSince,
      agentId,
    });
    return c.json({ events });
  });

  app.get(apiPaths.eventsStream, async (c) => {
    const runId = c.req.query("runId");
    if (!runId) {
      return c.json({ error: "runId_required" }, 400);
    }
    const agentId = c.req.query("agentId") ?? undefined;
    const dbInstance = c.get("db");

    return streamSSE(c, async (stream) => {
      let lastSeq = Number(c.req.query("sinceSeq") ?? "-1");
      if (Number.isNaN(lastSeq)) {
        lastSeq = -1;
      }
      const maxIterations = 600;
      let iterations = 0;

      while (iterations < maxIterations) {
        iterations += 1;
        const batch = listEvents(dbInstance, runId, { sinceSeq: lastSeq, agentId });
        for (const ev of batch) {
          await stream.writeSSE({
            data: JSON.stringify(ev),
            event: "event",
          });
          lastSeq = ev.seq;
        }
        await stream.sleep(800);
      }
    });
  });
}
