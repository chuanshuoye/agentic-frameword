import { apiPaths, ingestBatchBodySchema } from "@agentic/shared";
import type { MiddlewareHandler } from "hono";
import type { Hono } from "hono";
import type { AppEnv } from "../appEnv.js";
import { ingestEvents } from "../store.js";

export function registerIngestRoutes(app: Hono<AppEnv>, auth: MiddlewareHandler): void {
  app.post(apiPaths.ingestBatch, auth, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = ingestBatchBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    const dbInstance = c.get("db");
    const result = ingestEvents(dbInstance, parsed.data.events);
    return c.json({ ok: true, ...result });
  });
}
