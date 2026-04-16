import type { SessionIngestProvider } from "./types.js";
import { listClaudeProjects, resolveClaudeTranscriptsDir } from "../claudeProjects.js";
import { syncJsonlTranscriptsDir } from "./jsonlSession.js";

export function createClaudeIngestProvider(claudeProjectsRoot: string): SessionIngestProvider {
  return {
    id: "claude",
    listProjects: (opts) => listClaudeProjects(claudeProjectsRoot, opts),
    resolveTranscriptsDir: (projectName) => resolveClaudeTranscriptsDir(claudeProjectsRoot, projectName),
    sync: (db, transcriptsDir) =>
      syncJsonlTranscriptsDir(db, transcriptsDir, {
        sourceType: "claude_local",
        defaultAgentId: "claude-agent",
      }),
  };
}
