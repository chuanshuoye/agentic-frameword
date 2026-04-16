import { serve } from "@hono/node-server";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { loadMonorepoDotenv } from "@agentic/shared/node-env";
import { initApiLogDir } from "./logging/apiLog.js";
import { existsSync } from "node:fs";
import { createSessionIngestRegistry } from "./sessions/ingest/registry.js";

loadMonorepoDotenv(import.meta.url);

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const port = Number(process.env.AGENTIC_PORT ?? "8787");
const token = process.env.AGENTIC_SERVER_TOKEN ?? "123456";
const dbPath = process.env.AGENTIC_DB_PATH ?? join(__dirname, "..", "data", "agentic.db");
const logDir = process.env.AGENTIC_LOG_DIR ?? join(__dirname, "..", "..", "..", "logs");
const cursorProjectsRoot = process.env.AGENTIC_CURSOR_PROJECTS_ROOT ?? join(homedir(), ".cursor", "projects");
const cursorTranscriptsDir = process.env.AGENTIC_CURSOR_TRANSCRIPTS_DIR;
const claudeProjectsRoot =
  process.env.AGENTIC_CLAUDE_PROJECTS_ROOT ??
  process.env.AGENTIC_CLAUDE_TRANSCRIPTS_DIR ??
  (process.env.CLAUDE_CONFIG_DIR
    ? join(process.env.CLAUDE_CONFIG_DIR, "projects")
    : join(homedir(), ".claude", "projects"));
const claudeTranscriptsDir = process.env.AGENTIC_CLAUDE_TRANSCRIPTS_DIR;

const db = openDb(dbPath);
initApiLogDir(logDir);
const ingestRegistry = createSessionIngestRegistry({ cursorProjectsRoot, claudeProjectsRoot });

if (cursorTranscriptsDir) {
  try {
    const result = ingestRegistry.get("cursor").sync(db, cursorTranscriptsDir);
    console.log(
      `[agentic-session-sync] cursor scanned=${result.scannedFiles} inserted=${result.inserted} updated=${result.updated} skipped=${result.skipped}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.warn(`[agentic-session-sync] cursor startup sync skipped: ${message}`);
  }
} else {
  console.warn(
    "[agentic-session-sync] missing AGENTIC_CURSOR_TRANSCRIPTS_DIR, cursor startup sync skipped (可用 projectName 调用 /v1/sessions/sync)",
  );
}

if (existsSync(claudeProjectsRoot)) {
  try {
    const claudeResult = ingestRegistry.get("claude").sync(db, claudeProjectsRoot);
    console.log(
      `[agentic-session-sync] claude scanned=${claudeResult.scannedFiles} inserted=${claudeResult.inserted} updated=${claudeResult.updated} skipped=${claudeResult.skipped}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.warn(`[agentic-session-sync] claude startup sync skipped: ${message}`);
  }
} else {
  console.warn(`[agentic-session-sync] claude projects root 不存在，跳过启动同步：${claudeProjectsRoot}`);
}

const app = createApp(db, token, {
  cursorTranscriptsDir,
  claudeTranscriptsDir,
  cursorProjectsRoot,
  claudeProjectsRoot,
});

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`[agentic-token] ${token}`);
    console.log(`[agentic-server] listening on http://localhost:${info.port}`);
    console.log(`[agentic-server] db ${dbPath}`);
    console.log(`[agentic-server] logs ${logDir}`);
    console.log(`[agentic-server] cursor projects root ${cursorProjectsRoot}`);
    console.log(`[agentic-server] cursor transcripts override ${cursorTranscriptsDir ?? "(not set)"}`);
    console.log(`[agentic-server] claude projects root ${claudeProjectsRoot}`);
    console.log(`[agentic-server] claude transcripts override ${claudeTranscriptsDir ?? "(not set)"}`);
  },
);
