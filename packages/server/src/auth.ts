import type { Context, Next } from "hono";

export function bearerAuth(expectedToken: string | undefined) {
  return async (c: Context, next: Next) => {
    if (!expectedToken || expectedToken.length === 0) {
      return c.json({ error: "server_misconfigured", message: "AGENTIC_SERVER_TOKEN is not set" }, 503);
    }
    const header = c.req.header("authorization") ?? "";
    const prefix = "Bearer ";
    if (!header.startsWith(prefix)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const token = header.slice(prefix.length).trim();
    if (token !== expectedToken) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  };
}
