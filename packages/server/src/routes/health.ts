import type { Hono } from "hono";
import type { AppEnv } from "../appEnv.js";

export function registerHealthRoutes(app: Hono<AppEnv>): void {
  app.get("/health", (c) => c.json({ ok: true }));
}
