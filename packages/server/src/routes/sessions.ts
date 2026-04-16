import {
  API_PREFIX,
  apiPaths,
  sessionDistillRequestSchema,
  sessionProviderIdSchema,
  sessionsSyncBodySchema,
  sessionsSyncToRunsBodySchema,
} from "@agentic/shared";
import type { MiddlewareHandler } from "hono";
import type { Hono } from "hono";
import type { AppEnv } from "../appEnv.js";
import { createSessionIngestRegistry } from "../sessions/ingest/registry.js";
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
  claudeTranscriptsDir?: string;
  cursorProjectsRoot: string;
  claudeProjectsRoot: string;
};

export function registerSessionRoutes(
  app: Hono<AppEnv>,
  auth: MiddlewareHandler,
  opts: SessionsRouteOpts,
): void {
  const registry = createSessionIngestRegistry({
    cursorProjectsRoot: opts.cursorProjectsRoot,
    claudeProjectsRoot: opts.claudeProjectsRoot,
  });

  app.get(apiPaths.sessions, async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? "100") || 100, 100);
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
    const parsed = sessionsSyncBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    const { provider, projectName, transcriptsDir } = parsed.data;
    const ingest = registry.get(provider);
    const pname = (projectName ?? "").trim();
    const overrideDir = (transcriptsDir ?? "").trim();
    let targetDir = overrideDir;
    if (!targetDir) {
      if (provider === "cursor") {
        targetDir = opts.cursorTranscriptsDir ?? "";
      } else {
        targetDir = opts.claudeTranscriptsDir ?? "";
      }
    }
    targetDir = targetDir.trim();
    if (!targetDir && pname) {
      targetDir = ingest.resolveTranscriptsDir(pname) ?? "";
    }
    if (!targetDir) {
      return c.json(
        {
          error: "transcripts_dir_not_configured",
          provider,
          message:
            "请传 transcriptsDir、配置对应 provider 的环境变量覆盖目录，或传 projectName 在 projects 根目录下匹配",
        },
        400,
      );
    }
    try {
      const result = ingest.sync(c.get("db"), targetDir);
      return c.json({ ok: true, provider, targetDir, ...result });
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

  app.get(apiPaths.sessionsProjects, async (c) => {
    const rawProvider = (c.req.query("provider") ?? "cursor").trim();
    const parsedProvider = sessionProviderIdSchema.safeParse(rawProvider);
    if (!parsedProvider.success) {
      return c.json({ error: "invalid_provider" }, 400);
    }
    const ingest = registry.get(parsedProvider.data);
    const projectName = (c.req.query("projectName") ?? "").trim();
    const projects = ingest.listProjects({ projectName: projectName || undefined });
    return c.json({ projects });
  });

  app.get(apiPaths.sessionsCursorProjects, async (c) => {
    const projectName = (c.req.query("projectName") ?? "").trim();
    const projects = registry.get("cursor").listProjects({ projectName: projectName || undefined });
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
