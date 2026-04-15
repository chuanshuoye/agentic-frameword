import {
  API_PREFIX,
  apiPaths,
  sessionDistillRequestSchema,
  sessionsSyncToRunsBodySchema,
} from "@agentic/shared";
import type { MiddlewareHandler } from "hono";
import type { Hono } from "hono";
import type { AppEnv } from "../appEnv.js";
import { listCursorProjects, resolveCursorTranscriptsDir } from "../sessions/cursorProjects.js";
import { syncCursorTranscripts } from "../sessions/cursorTranscripts.js";
import { buildDistillFileName, distillSessionsToJsonl } from "../sessions/sessionDistill.js";
import { buildSessionSyncRunId, convertSessionsToEvents } from "../sessions/sessionToEvents.js";
import {
  deleteSessionsByIds,
  getSessionDetail,
  ingestEvents,
  searchSessions,
} from "../store.js";

export type SessionsRouteOpts = {
  cursorTranscriptsDir?: string;
  cursorProjectsRoot: string;
};

export function registerSessionRoutes(
  app: Hono<AppEnv>,
  auth: MiddlewareHandler,
  opts: SessionsRouteOpts,
): void {
  app.get(apiPaths.sessions, async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? "20") || 20, 100);
    const offset = Math.max(Number(c.req.query("offset") ?? "0") || 0, 0);
    const q = (c.req.query("q") ?? "").trim();
    const projectKey = (c.req.query("projectKey") ?? "").trim();
    const agentId = (c.req.query("agentId") ?? "").trim();
    const sessions = searchSessions(c.get("db"), {
      limit,
      offset,
      query: q || undefined,
      projectKey: projectKey || undefined,
      agentId: agentId || undefined,
    });
    return c.json({ sessions });
  });

  app.post(apiPaths.sessionsSync, auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const input = (body ?? {}) as { projectName?: string; transcriptsDir?: string };
    const projectName = (input.projectName ?? "").trim();
    const overrideDir = (input.transcriptsDir ?? "").trim();
    let targetDir = overrideDir || opts.cursorTranscriptsDir;
    if (!targetDir && projectName) {
      targetDir = resolveCursorTranscriptsDir(opts.cursorProjectsRoot, projectName) ?? undefined;
    }
    if (!targetDir) {
      return c.json(
        {
          error: "cursor_transcripts_dir_not_configured",
          message: "请配置 AGENTIC_CURSOR_TRANSCRIPTS_DIR，或在请求体传 projectName/transcriptsDir",
        },
        400,
      );
    }
    try {
      const result = syncCursorTranscripts(c.get("db"), targetDir);
      return c.json({ ok: true, targetDir, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      return c.json({ error: "sync_failed", message }, 500);
    }
  });

  app.post(apiPaths.sessionsDistill, auth, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = sessionDistillRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    const data = parsed.data;
    const finalOutputFileName =
      data.outputFileName ?? buildDistillFileName(data.sourceFiles.join("|"));
    try {
      const result = await distillSessionsToJsonl(c.get("db"), {
        ...data,
        outputFileName: finalOutputFileName,
      });
      return c.json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      return c.json({ error: "distill_failed", message }, 500);
    }
  });

  app.post(apiPaths.sessionsSyncToRuns, auth, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = sessionsSyncToRunsBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    const ids = Array.from(new Set(parsed.data.sessionIds));
    const dbInstance = c.get("db");
    const sessions = [];
    for (const id of ids) {
      const row = getSessionDetail(dbInstance, id);
      if (row) {
        sessions.push(row);
      }
    }
    if (sessions.length === 0) {
      return c.json({ error: "not_found", message: "未找到可同步的会话" }, 404);
    }
    const runId = buildSessionSyncRunId(ids);
    const events = convertSessionsToEvents(sessions, {
      runId,
      granularity: parsed.data.granularity,
    });
    const result = ingestEvents(dbInstance, events);
    return c.json({
      ok: true,
      runId,
      inserted: result.inserted,
      skipped: result.skipped,
      sessionsProcessed: sessions.length,
      eventsGenerated: events.length,
    });
  });

  app.post(apiPaths.sessionsBatchDelete, auth, async (c) => {
    const body = await c.req.json().catch(() => null);
    const idsRaw = (body as { ids?: unknown } | null)?.ids;
    if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
      return c.json({ error: "invalid_body", message: "ids 不能为空数组" }, 400);
    }
    const ids: number[] = [];
    for (const item of idsRaw) {
      if (!Number.isInteger(item) || Number(item) <= 0) {
        return c.json({ error: "invalid_body", message: "ids 必须是正整数数组" }, 400);
      }
      ids.push(Number(item));
    }
    const result = deleteSessionsByIds(c.get("db"), Array.from(new Set(ids)));
    return c.json({ ok: true, ...result });
  });

  app.get(apiPaths.sessionsCursorProjects, async (c) => {
    const projectName = (c.req.query("projectName") ?? "").trim();
    const projects = listCursorProjects(opts.cursorProjectsRoot, {
      projectName: projectName || undefined,
    });
    return c.json({ projects });
  });

  app.get(`${API_PREFIX}/sessions/:id`, async (c) => {
    const raw = c.req.param("id");
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const session = getSessionDetail(c.get("db"), id);
    if (!session) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ session });
  });
}
