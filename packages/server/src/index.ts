import { serve } from "@hono/node-server";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { loadMonorepoDotenv } from "@agentic/shared/node-env";
import { initApiLogDir } from "./logging/apiLog.js";
import { syncCursorTranscripts } from "./sessions/cursorTranscripts.js";

loadMonorepoDotenv(import.meta.url);

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const port = Number(process.env.AGENTIC_PORT ?? "8787");
const token = process.env.AGENTIC_SERVER_TOKEN ?? "123456";
const dbPath = process.env.AGENTIC_DB_PATH ?? join(__dirname, "..", "data", "agentic.db");
const logDir = process.env.AGENTIC_LOG_DIR ?? join(__dirname, "..", "..", "..", "logs");
const cursorProjectsRoot = process.env.AGENTIC_CURSOR_PROJECTS_ROOT ?? join(homedir(), ".cursor", "projects");
const cursorTranscriptsDir = process.env.AGENTIC_CURSOR_TRANSCRIPTS_DIR;
const claudeTranscriptsDir =
  process.env.AGENTIC_CLAUDE_TRANSCRIPTS_DIR ??
  (process.env.CLAUDE_CONFIG_DIR ? join(process.env.CLAUDE_CONFIG_DIR, "projects") : "~/.claude/projects");

const db = openDb(dbPath);
initApiLogDir(logDir);
if (cursorTranscriptsDir) {
  try {
    const result = syncCursorTranscripts(db, cursorTranscriptsDir);
    console.log(
      `[agentic-session-sync] cursor scanned=${result.scannedFiles} inserted=${result.inserted} updated=${result.updated} skipped=${result.skipped}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.warn(`[agentic-session-sync] cursor disabled: ${message}`);
  }
} else {
  console.warn(
    "[agentic-session-sync] missing AGENTIC_CURSOR_TRANSCRIPTS_DIR, startup sync skipped (can sync by projectName via /v1/sessions/sync)",
  );
}

const app = createApp(db, token, { cursorTranscriptsDir, cursorProjectsRoot });

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
    console.log(`[agentic-server] claude transcripts placeholder ${claudeTranscriptsDir}`);
  },
);
