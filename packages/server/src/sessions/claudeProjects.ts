import type { SessionProjectCandidate } from "@agentic/shared";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { collectJsonlFiles } from "./ingest/jsonlSession.js";

export function listClaudeProjects(
  projectsRoot: string,
  opts: { projectName?: string } = {},
): SessionProjectCandidate[] {
  const root = resolve(projectsRoot);
  if (!existsSync(root)) {
    return [];
  }
  const entries = readdirSync(root, { withFileTypes: true });
  const nameQuery = normalize(opts.projectName);
  const out: SessionProjectCandidate[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const fullPath = join(root, entry.name);
    const jsonlFiles = collectJsonlFiles(fullPath);
    const candidate: SessionProjectCandidate = {
      provider: "claude",
      name: entry.name,
      path: fullPath,
      transcriptsDir: fullPath,
      hasTranscripts: jsonlFiles.length > 0,
    };
    if (nameQuery && !normalize(entry.name).includes(nameQuery)) {
      continue;
    }
    out.push(candidate);
  }
  return out.sort((a, b) => Number(b.hasTranscripts) - Number(a.hasTranscripts));
}

export function resolveClaudeTranscriptsDir(projectsRoot: string, projectName: string): string | null {
  const candidates = listClaudeProjects(projectsRoot, { projectName });
  const matched = candidates.find((item) => item.hasTranscripts);
  return matched ? matched.transcriptsDir : null;
}

function normalize(input: string | undefined): string {
  return (input ?? "").trim().toLowerCase();
}
