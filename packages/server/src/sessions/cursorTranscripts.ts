import type Database from "better-sqlite3";
import { syncJsonlTranscriptsDir } from "./ingest/jsonlSession.js";

/** @deprecated 优先使用 ingest 层 `syncJsonlTranscriptsDir` + provider；保留兼容 distill 等调用 */
export function syncCursorTranscripts(
  db: Database.Database,
  transcriptsDir: string,
): { scannedFiles: number; inserted: number; updated: number; skipped: number } {
  return syncJsonlTranscriptsDir(db, transcriptsDir, {
    sourceType: "cursor_local",
    defaultAgentId: "cursor-agent",
  });
}
