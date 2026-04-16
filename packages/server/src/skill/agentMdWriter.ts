import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HarnessFailureCase } from "@agentic/shared";

const AUTO_START = "<!-- AUTO_FAILURE_CASES_START -->";
const AUTO_END = "<!-- AUTO_FAILURE_CASES_END -->";

function ensureTemplate(content: string): string {
  if (content.trim().length > 0 && content.includes(AUTO_START) && content.includes(AUTO_END)) {
    return content;
  }
  return `# Agent Knowledge Base

## Scope

- Auto-generated and human-maintained knowledge for agent reliability.

## Operating Constraints

- Keep entries evidence-based and actionable.

## Failure Cases
${AUTO_START}
${AUTO_END}

## Stable Playbooks

- (Human maintained)

## Changelog

- Initialized
`;
}

function blockForCase(item: HarnessFailureCase): string {
  const evidence = item.evidence.map((x) => `  - ${x}`).join("\n");
  const guardrails = item.guardrails.map((x) => `  - ${x}`).join("\n");
  return `### ${item.caseId}
- ID: ${item.caseId}
- Context (runId/agentId): ${item.runId}/${item.agentId ?? "unknown"}
- Failure Pattern: ${item.failureType} | ${item.symptom}
- Evidence:
${evidence}
- Root Cause Hypothesis: ${item.rootCauseHypothesis}
- Recovery / Fix: ${item.recoveryFix}
- Guardrails:
${guardrails}
- Updated At: ${item.updatedAt ?? new Date().toISOString()}
- Hit Count: ${item.hitCount ?? 1}
- Fingerprint: ${item.failureFingerprint}`;
}

type ParsedCase = { fingerprint: string; block: string };

function parseExistingAutoBlocks(section: string): ParsedCase[] {
  const chunks = section
    .split(/^###\s+/m)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => `### ${x}`);
  const out: ParsedCase[] = [];
  for (const c of chunks) {
    const fp = c.match(/- Fingerprint:\s*(.+)\s*$/m)?.[1]?.trim();
    if (!fp) {
      continue;
    }
    out.push({ fingerprint: fp, block: c.trim() });
  }
  return out;
}

export async function mergeFailureCasesToAgentMd(args: {
  repoRoot?: string;
  mode: "dry_run" | "write_agent_md";
  cases: HarnessFailureCase[];
}): Promise<{ mode: "dry_run" | "write_agent_md"; path: string; updated: boolean; inserted: number; merged: number }> {
  const repoRoot = args.repoRoot ?? process.cwd();
  const targetPath = path.join(repoRoot, "AGENT.md");
  if (args.mode === "dry_run") {
    return { mode: "dry_run", path: targetPath, updated: false, inserted: 0, merged: 0 };
  }

  const raw = await readFile(targetPath, "utf8").catch(() => "");
  const templated = ensureTemplate(raw);
  const m = templated.match(
    new RegExp(`${AUTO_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([\\s\\S]*?)${AUTO_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  );
  const existingSection = m?.[1] ?? "";
  const existing = parseExistingAutoBlocks(existingSection);
  const byFingerprint = new Map(existing.map((x) => [x.fingerprint, x.block]));

  let inserted = 0;
  let merged = 0;
  for (const item of args.cases) {
    const fp = item.failureFingerprint ?? `${item.runId}:${item.caseId}`;
    const block = blockForCase(item);
    if (byFingerprint.has(fp)) {
      merged += 1;
    } else {
      inserted += 1;
    }
    byFingerprint.set(fp, block);
  }

  const mergedBlocks = Array.from(byFingerprint.values()).join("\n\n");
  const next = templated.replace(
    new RegExp(`${AUTO_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([\\s\\S]*?)${AUTO_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    `${AUTO_START}\n${mergedBlocks}\n${AUTO_END}`,
  );

  if (next !== raw) {
    await writeFile(targetPath, next, "utf8");
    return { mode: "write_agent_md", path: targetPath, updated: true, inserted, merged };
  }
  return { mode: "write_agent_md", path: targetPath, updated: false, inserted, merged };
}
