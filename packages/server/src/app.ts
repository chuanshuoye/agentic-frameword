import { Hono } from "hono";
import { cors } from "hono/cors";
import type Database from "better-sqlite3";
import { bearerAuth } from "./auth.js";
import type { AppEnv } from "./appEnv.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerIngestRoutes } from "./routes/ingest.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerSkillEvolutionRoutes } from "./routes/skillEvolution.js";
import { registerSkillFeedbackRoutes } from "./routes/skillFeedback.js";
import { registerSkillGovernanceRoutes } from "./routes/skillGovernance.js";
import { registerSkillRoutes } from "./routes/skills.js";

export type { AppEnv } from "./appEnv.js";

export function createApp(
  db: Database.Database,
  token: string | undefined,
  opts: { cursorTranscriptsDir?: string; cursorProjectsRoot: string },
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const HTTP_ERROR_LOG_PREFIX = "[agentic-http-error]";

  app.use("*", async (c, next) => {
    c.set("db", db);
    await next();
  });

  app.use("*", async (c, next) => {
    const startedAt = Date.now();
    try {
      await next();
    } catch (error) {
      console.error(
        `${HTTP_ERROR_LOG_PREFIX} uncaught`,
        JSON.stringify({
          method: c.req.method,
          path: new URL(c.req.url).pathname,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw error;
    }

    if (c.res.status >= 400) {
      console.error(
        `${HTTP_ERROR_LOG_PREFIX} response`,
        JSON.stringify({
          method: c.req.method,
          path: new URL(c.req.url).pathname,
          status: c.res.status,
          durationMs: Date.now() - startedAt,
        }),
      );
    }
  });

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type"],
    }),
  );

  const auth = bearerAuth(token);

  registerHealthRoutes(app);
  registerIngestRoutes(app, auth);
  registerRunRoutes(app, auth);
  registerSkillRoutes(app, auth);
  registerSkillGovernanceRoutes(app, auth);
  registerSkillEvolutionRoutes(app, auth);
  registerSkillFeedbackRoutes(app, auth);
  registerSessionRoutes(app, auth, opts);

  return app;
}
