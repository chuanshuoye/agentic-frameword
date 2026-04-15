import { appendFile, mkdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export type ApiLogRecord = {
  ts?: string;
  [k: string]: unknown;
};

const REDACTED_TEXT = "[REDACTED]";
const SENSITIVE_KEYS = ["authorization", "apiKey", "token", "secret", "password", "cookie"];
const DEFAULT_BODY_LIMIT = 8000;

let configuredLogDir: string | undefined;
let ensureDirPromise: Promise<void> | undefined;

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => lower.includes(s.toLowerCase()));
}

function formatLocalDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function truncateString(value: string, maxLen: number): string {
  if (value.length <= maxLen) {
    return value;
  }
  return `${value.slice(0, maxLen)}...<truncated>`;
}

export function initApiLogDir(logDir: string): void {
  if (isAbsolute(logDir)) {
    configuredLogDir = logDir;
  } else {
    configuredLogDir = join(process.cwd(), logDir);
  }
  ensureDirPromise = undefined;
}

export function resolveApiLogDir(): string {
  if (configuredLogDir) {
    return configuredLogDir;
  }
  return join(process.cwd(), "logs");
}

export async function ensureLogsDir(): Promise<void> {
  if (!ensureDirPromise) {
    ensureDirPromise = mkdir(resolveApiLogDir(), { recursive: true }).then(() => undefined);
  }
  await ensureDirPromise;
}

export function getDailyLogFilePath(now = new Date()): string {
  return join(resolveApiLogDir(), `${formatLocalDate(now)}.jsonl`);
}

export function redactSensitive<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => redactSensitive(item)) as T;
  }
  if (typeof data === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = REDACTED_TEXT;
      } else {
        out[k] = redactSensitive(v);
      }
    }
    return out as T;
  }
  return data;
}

export function safeSerializeBody(input: unknown, maxLen = DEFAULT_BODY_LIMIT): JsonValue {
  const redacted = redactSensitive(input);
  if (redacted === null || redacted === undefined) {
    return null;
  }
  if (typeof redacted === "string") {
    return truncateString(redacted, maxLen);
  }
  if (typeof redacted === "number" || typeof redacted === "boolean") {
    return redacted;
  }
  try {
    const serialized = JSON.stringify(redacted);
    if (typeof serialized !== "string") {
      return null;
    }
    const limited = truncateString(serialized, maxLen);
    try {
      return JSON.parse(limited) as JsonValue;
    } catch {
      return limited;
    }
  } catch {
    return "[UNSERIALIZABLE]";
  }
}

export async function appendJsonl(record: ApiLogRecord): Promise<void> {
  await ensureLogsDir();
  const line = `${JSON.stringify(record)}\n`;
  await appendFile(getDailyLogFilePath(), line, "utf8");
}

export async function writeApiLog(record: ApiLogRecord): Promise<void> {
  const payload: ApiLogRecord = {
    ts: new Date().toISOString(),
    ...redactSensitive(record),
  };
  try {
    await appendJsonl(payload);
  } catch (error) {
    console.warn("[agentic-api-log] write_failed", error);
  }
}
