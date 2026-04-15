import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import type Database from "better-sqlite3";
import { upsertProject, upsertSessions, type SessionUpsertInput } from "../store.js";

type ParsedSession = SessionUpsertInput & {
  projectName: string;
  projectPath: string;
};

export function syncCursorTranscripts(
  db: Database.Database,
  transcriptsDir: string,
): { scannedFiles: number; inserted: number; updated: number; skipped: number } {
  const root = resolve(transcriptsDir);
  const files = collectJsonlFiles(root);
  const parsed: ParsedSession[] = [];
  let skipped = 0;

  for (const filePath of files) {
    const result = parseTranscriptFile(root, filePath);
    if (result) {
      parsed.push(result);
    } else {
      skipped += 1;
    }
  }

  const projectMap = new Map<string, { projectName: string; projectPath: string }>();
  for (const item of parsed) {
    projectMap.set(item.projectKey, {
      projectName: item.projectName,
      projectPath: item.projectPath,
    });
  }

  const tx = db.transaction(() => {
    for (const [projectKey, project] of projectMap) {
      upsertProject(db, {
        projectKey,
        projectName: project.projectName,
        projectPath: project.projectPath,
      });
    }
    const sessionRows: SessionUpsertInput[] = parsed.map((item) => ({
      projectKey: item.projectKey,
      sourceType: item.sourceType,
      sourceAgentId: item.sourceAgentId,
      sessionId: item.sessionId,
      title: item.title,
      timeStart: item.timeStart,
      timeEnd: item.timeEnd,
      previewExcerpt: item.previewExcerpt,
      rawRef: item.rawRef,
      contentText: item.contentText,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens,
      totalTokens: item.totalTokens,
    }));
    return upsertSessions(db, sessionRows);
  });

  const writeResult = tx();
  return {
    scannedFiles: files.length,
    inserted: writeResult.inserted,
    updated: writeResult.updated,
    skipped,
  };
}

function collectJsonlFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && extname(entry.name).toLowerCase() === ".jsonl") {
        out.push(fullPath);
      }
    }
  }
  return out;
}

function parseTranscriptFile(root: string, filePath: string): ParsedSession | null {
  const raw = readFileSync(filePath, "utf8");
  if (!raw.trim()) {
    return null;
  }
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return null;
  }

  const records: Record<string, unknown>[] = [];
  for (const line of lines) {
    try {
      const item = JSON.parse(line) as unknown;
      if (isRecord(item)) {
        records.push(item);
      }
    } catch {
      // ignore invalid jsonl line
    }
  }
  if (records.length === 0) {
    return null;
  }

  const relativePath = relative(root, filePath);
  const sessionId = basename(filePath, ".jsonl");
  const first = records[0];
  const last = records[records.length - 1];
  const projectPath = pickProjectPath(first, last, relativePath);
  const projectName = basename(projectPath);
  const projectKey = toProjectKey(projectName, projectPath);
  const sourceAgentId = pickAgentId(first, last, relativePath);
  const timeStart = pickTimestamp(first) ?? new Date(0).toISOString();
  const timeEnd = pickTimestamp(last) ?? timeStart;
  const title = pickTitle(first, sessionId);
  const contentText = buildContent(records);
  const previewExcerpt = contentText.slice(0, 500);
  const usage = computeTokenUsage(records, contentText);

  return {
    projectName,
    projectPath,
    projectKey,
    sourceType: "cursor_local",
    sourceAgentId,
    sessionId,
    title,
    timeStart,
    timeEnd,
    previewExcerpt,
    rawRef: filePath,
    contentText,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

function pickProjectPath(
  first: Record<string, unknown>,
  last: Record<string, unknown>,
  relativePath: string,
): string {
  const fromPayload = firstString(
    first["projectPath"],
    first["project_path"],
    first["workspacePath"],
    first["workspace_path"],
    first["cwd"],
    last["projectPath"],
    last["project_path"],
    last["workspacePath"],
    last["workspace_path"],
    last["cwd"],
  );
  if (fromPayload) {
    return fromPayload;
  }
  const parts = relativePath.split(sep).filter(Boolean);
  if (parts.length > 1) {
    return parts.slice(0, parts.length - 1).join(sep);
  }
  return "unknown-project";
}

function pickAgentId(
  first: Record<string, unknown>,
  last: Record<string, unknown>,
  relativePath: string,
): string {
  const fromPayload = firstString(
    first["agentId"],
    first["agent_id"],
    first["assistantId"],
    last["agentId"],
    last["agent_id"],
    last["assistantId"],
  );
  if (fromPayload) {
    return fromPayload;
  }
  const parts = relativePath.split(sep).filter(Boolean);
  if (parts.length > 1) {
    return parts[parts.length - 2];
  }
  return "cursor-agent";
}

function pickTimestamp(record: Record<string, unknown>): string | null {
  const value = firstString(
    record["timestamp"],
    record["ts"],
    record["createdAt"],
    record["created_at"],
    record["time"],
  );
  if (!value) {
    return null;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toISOString();
}

function pickTitle(record: Record<string, unknown>, fallback: string): string {
  const value = firstString(
    record["title"],
    record["summary"],
    record["name"],
    record["prompt"],
    record["message"],
  );
  if (!value) {
    return fallback;
  }
  return value.slice(0, 120);
}

function buildContent(records: Record<string, unknown>[]): string {
  const chunks: string[] = [];
  for (const record of records) {
    const role = firstString(record["role"], record["type"], "entry");
    const text = extractText(record);
    chunks.push(`[${role}] ${text}`);
  }
  return chunks.join("\n").slice(0, 200_000);
}

function extractText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const texts = value
      .map((item) => extractText(item))
      .filter((item) => item.length > 0);
    return texts.join(" ");
  }
  if (!isRecord(value)) {
    return "";
  }
  const direct = firstString(
    value["text"],
    value["content"],
    value["message"],
    value["input"],
    value["output"],
  );
  if (direct) {
    return direct;
  }
  return JSON.stringify(value);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function toProjectKey(projectName: string, projectPath: string): string {
  return createHash("sha1").update(`${projectName}::${projectPath}`).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function computeTokenUsage(
  records: Record<string, unknown>[],
  contentText: string,
): { inputTokens: number; outputTokens: number; totalTokens: number } {
  let input = 0;
  let output = 0;
  let total = 0;
  for (const record of records) {
    const usage = pickUsageObject(record);
    if (!usage) {
      continue;
    }
    input += pickNumber(usage, ["input_tokens", "prompt_tokens", "inputTokens"]) ?? 0;
    output += pickNumber(usage, ["output_tokens", "completion_tokens", "outputTokens"]) ?? 0;
    total += pickNumber(usage, ["total_tokens", "totalTokens"]) ?? 0;
  }
  if (total === 0) {
    total = input + output;
  }
  if (total === 0) {
    total = Math.max(1, Math.ceil(contentText.length / 4));
    input = Math.floor(total * 0.6);
    output = total - input;
  }
  return { inputTokens: input, outputTokens: output, totalTokens: total };
}

function pickUsageObject(record: Record<string, unknown>): Record<string, unknown> | null {
  const candidates = [record["usage"], record["tokenUsage"], record["tokens"], record["metrics"]];
  for (const candidate of candidates) {
    if (isRecord(candidate)) {
      return candidate;
    }
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.round(value));
    }
  }
  return null;
}
