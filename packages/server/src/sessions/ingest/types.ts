import type Database from "better-sqlite3";
import type { SessionProjectCandidate, SessionProviderId } from "@agentic/shared";

export type SessionSyncStats = {
  scannedFiles: number;
  inserted: number;
  updated: number;
  skipped: number;
};

export type SessionIngestProvider = {
  id: SessionProviderId;
  listProjects(opts: { projectName?: string }): SessionProjectCandidate[];
  resolveTranscriptsDir(projectName: string): string | null;
  sync(db: Database.Database, transcriptsDir: string): SessionSyncStats;
};
