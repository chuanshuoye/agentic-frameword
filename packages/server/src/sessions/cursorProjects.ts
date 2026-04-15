import type { CursorProjectCandidate } from "@agentic/shared";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

export function listCursorProjects(
  projectsRoot: string,
  opts: { projectName?: string } = {},
): CursorProjectCandidate[] {
  const root = resolve(projectsRoot);
  if (!existsSync(root)) {
    return [];
  }
  const entries = readdirSync(root, { withFileTypes: true });
  const nameQuery = normalize(opts.projectName);
  const out: CursorProjectCandidate[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const fullPath = join(root, entry.name);
    const transcriptsDir = join(fullPath, "agent-transcripts");
    const candidate: CursorProjectCandidate = {
      name: entry.name,
      path: fullPath,
      transcriptsDir,
      hasTranscripts: existsSync(transcriptsDir),
    };
    if (nameQuery && !normalize(entry.name).includes(nameQuery)) {
      continue;
    }
    out.push(candidate);
  }
  return out.sort((a, b) => Number(b.hasTranscripts) - Number(a.hasTranscripts));
}

export function resolveCursorTranscriptsDir(
  projectsRoot: string,
  projectName: string,
): string | null {
  const candidates = listCursorProjects(projectsRoot, { projectName });
  const matched = candidates.find((item) => item.hasTranscripts);
  return matched ? matched.transcriptsDir : null;
}

function normalize(input: string | undefined): string {
  return (input ?? "").trim().toLowerCase();
}
