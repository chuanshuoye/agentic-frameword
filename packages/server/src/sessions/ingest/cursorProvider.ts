import type { SessionIngestProvider } from "./types.js";
import { listCursorProjects, resolveCursorTranscriptsDir } from "../cursorProjects.js";
import { syncJsonlTranscriptsDir } from "./jsonlSession.js";

export function createCursorIngestProvider(cursorProjectsRoot: string): SessionIngestProvider {
  return {
    id: "cursor",
    listProjects: (opts) => listCursorProjects(cursorProjectsRoot, opts),
    resolveTranscriptsDir: (projectName) => resolveCursorTranscriptsDir(cursorProjectsRoot, projectName),
    sync: (db, transcriptsDir) =>
      syncJsonlTranscriptsDir(db, transcriptsDir, {
        sourceType: "cursor_local",
        defaultAgentId: "cursor-agent",
      }),
  };
}
