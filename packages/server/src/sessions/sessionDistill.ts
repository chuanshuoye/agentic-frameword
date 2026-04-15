import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type Database from "better-sqlite3";
import type { DistillConfig, SessionDistillRequest } from "@agentic/shared";
import { callChatCompletionsJsonText, stripMarkdownJsonFence } from "../skill/llm.js";
import {
  sessionDistillLlmApiKeyFromEnv,
  sessionDistillLlmBaseUrl,
  sessionDistillLlmModel,
} from "../skill/env.js";
import { syncCursorTranscripts } from "./cursorTranscripts.js";

type DistillChunkSummary = {
  goal: string[];
  decisions: string[];
  changes: string[];
  openIssues: string[];
  nextActions: string[];
  keyFiles: string[];
};

type DistillFidelityReport = {
  sourceSessions: number;
  sourceRecords: number;
  sourceChars: number;
  distilledChars: number;
  compressionRatio: number;
  keywordCoverageRatio: number;
  duplicateRatio: number;
  lengthDeviationRatio: number;
  missingSections: string[];
  pass: boolean;
};

type DistillResult = {
  outputFilePath: string;
  outputDir: string;
  sessionId: string;
  fidelity: DistillFidelityReport;
  syncResult?: { scannedFiles: number; inserted: number; updated: number; skipped: number };
};

type RawMessage = {
  timestamp: string;
  role: string;
  text: string;
  sourceFile: string;
};

const SECTION_NAMES = ["goal", "decisions", "changes", "openIssues", "nextActions"] as const;

const DEFAULT_CONFIG: DistillConfig = {
  chunkSizeTokens: 1000,
  chunkOverlapTokens: 150,
  strategy: "map_reduce",
  detailLevel: 0.5,
  targetCompressionRatio: 0.2,
  maxOutputTokens: 3000,
  maxBullets: 12,
  maxSentencesPerBullet: 2,
  factualityMode: "strict_extract_only",
  outputTemplate: {
    sections: [...SECTION_NAMES],
  },
  temperature: 0.2,
  topP: 1,
  parallelism: 4,
  maxRetries: 1,
  timeoutMs: 45000,
  budgetTokens: 200000,
  qualityChecks: {
    minCoverageRatio: 0.7,
    maxDuplicateRatio: 0.2,
    maxLengthDeviationRatio: 0.35,
    requireSections: ["goal", "decisions", "changes", "openIssues", "nextActions"],
  },
};

export async function distillSessionsToJsonl(
  db: Database.Database,
  input: SessionDistillRequest,
): Promise<DistillResult> {
  const cfg = mergeConfig(input.config);
  const transcriptsRoot = resolve(input.transcriptsDir);
  const files = input.sourceFiles.map((item) => toAbsolutePath(transcriptsRoot, item));
  const messages = collectMessages(files);
  const chunkSizeChars = Math.max(800, cfg.chunkSizeTokens * 4);
  const overlapChars = cfg.chunkOverlapTokens * 4;
  const chunks = chunkTexts(messages, chunkSizeChars, overlapChars);

  const llmApiKey = (input.apiKey ?? sessionDistillLlmApiKeyFromEnv()).trim();
  const llmBaseUrl = sessionDistillLlmBaseUrl();
  const llmModel = (cfg.model ?? sessionDistillLlmModel()).trim();
  const mapSummaries = await summarizeChunks(chunks, cfg, {
    apiKey: llmApiKey,
    baseUrl: llmBaseUrl,
    model: llmModel,
  });
  const reduced = await reduceSummaries(mapSummaries, cfg, {
    apiKey: llmApiKey,
    baseUrl: llmBaseUrl,
    model: llmModel,
  });

  const sessionId = input.outputFileName
    ? basename(input.outputFileName, ".jsonl")
    : `distilled-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  const outputDir = resolve(
    input.outputDir ?? join(transcriptsRoot, input.agentId ?? "distilled", "distilled"),
  );
  const outputFilePath = join(outputDir, `${sessionId}.jsonl`);
  mkdirSync(dirname(outputFilePath), { recursive: true });
  const finalTitle = (input.title ?? `Distilled Session ${new Date().toISOString()}`).slice(0, 120);
  const lines = buildDistilledJsonlLines({
    sessionId,
    title: finalTitle,
    projectPath: transcriptsRoot,
    projectName: input.projectName ?? basename(transcriptsRoot),
    agentId: input.agentId ?? "distill-agent",
    sourceFiles: files,
    reduced,
    cfg,
  });
  writeFileSync(outputFilePath, `${lines.join("\n")}\n`, "utf8");

  const fidelity = buildFidelityReport(messages, reduced, cfg);
  let syncResult: DistillResult["syncResult"];
  if (input.syncAfterWrite) {
    syncResult = syncCursorTranscripts(db, transcriptsRoot);
  }
  return {
    outputFilePath,
    outputDir,
    sessionId,
    fidelity,
    syncResult,
  };
}

function mergeConfig(override: DistillConfig | undefined): DistillConfig {
  if (!override) {
    return DEFAULT_CONFIG;
  }
  return {
    ...DEFAULT_CONFIG,
    ...override,
    outputTemplate: {
      ...DEFAULT_CONFIG.outputTemplate,
      ...(override.outputTemplate ?? {}),
    },
    qualityChecks: {
      ...DEFAULT_CONFIG.qualityChecks,
      ...(override.qualityChecks ?? {}),
    },
  };
}

function toAbsolutePath(root: string, file: string): string {
  if (isAbsolute(file)) {
    return resolve(file);
  }
  return resolve(root, file);
}

function collectMessages(files: string[]): RawMessage[] {
  const out: RawMessage[] = [];
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const lines = raw.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        const text = extractText(obj);
        if (!text) {
          continue;
        }
        out.push({
          timestamp: pickString(obj.timestamp, obj.ts, obj.createdAt, obj.time) ?? new Date().toISOString(),
          role: pickString(obj.role, obj.type) ?? "entry",
          text,
          sourceFile: file,
        });
      } catch {
        continue;
      }
    }
  }
  return out;
}

function pickString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string") {
      const s = v.trim();
      if (s) {
        return s;
      }
    }
  }
  return null;
}

function extractText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const parts = value.map((item) => extractText(item)).filter((item) => item.length > 0);
    return parts.join(" ");
  }
  if (typeof value !== "object" || value === null) {
    return "";
  }
  const obj = value as Record<string, unknown>;
  const direct = pickString(obj.text, obj.content, obj.message, obj.input, obj.output);
  if (direct) {
    return direct;
  }
  return JSON.stringify(obj);
}

function chunkTexts(messages: RawMessage[], chunkSizeChars: number, overlapChars: number): string[] {
  const flat = messages.map((m) => `[${m.role}] ${m.text}`).join("\n");
  if (flat.length <= chunkSizeChars) {
    return [flat];
  }
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < flat.length) {
    const end = Math.min(flat.length, cursor + chunkSizeChars);
    chunks.push(flat.slice(cursor, end));
    if (end === flat.length) {
      break;
    }
    cursor = Math.max(0, end - overlapChars);
  }
  return chunks;
}

async function summarizeChunks(
  chunks: string[],
  cfg: DistillConfig,
  llm: { apiKey: string; baseUrl: string; model: string },
): Promise<DistillChunkSummary[]> {
  const run = async (chunk: string): Promise<DistillChunkSummary> => summarizeOneChunk(chunk, cfg, llm);
  return runInPool(chunks, Math.max(1, cfg.parallelism), run);
}

async function reduceSummaries(
  mapSummaries: DistillChunkSummary[],
  cfg: DistillConfig,
  llm: { apiKey: string; baseUrl: string; model: string },
): Promise<DistillChunkSummary> {
  if (mapSummaries.length === 1) {
    return mapSummaries[0];
  }
  if (!llm.apiKey) {
    return mergeSummariesLocal(mapSummaries, cfg);
  }
  const prompt = [
    "你是会话蒸馏器。请把多个分块摘要合并成一个最终摘要。",
    "必须仅使用输入中出现的信息，不可补充推断事实。",
    `目标压缩率: ${cfg.targetCompressionRatio}`,
    `输出字段: ${cfg.outputTemplate.sections.join(", ")}`,
    "必须输出严格 JSON，字段为 goal/decisions/changes/openIssues/nextActions/keyFiles，每个字段均为字符串数组。",
    JSON.stringify(mapSummaries),
  ].join("\n");
  const responseText = await callChatCompletionsJsonText({
    baseUrl: llm.baseUrl,
    apiKey: llm.apiKey,
    model: llm.model,
    messages: [
      { role: "system", content: "你是严谨的技术会话摘要模型。禁止幻觉。" },
      { role: "user", content: prompt },
    ],
  });
  const parsed = safeParseSummaryJson(responseText.text);
  if (parsed) {
    return parsed;
  }
  return mergeSummariesLocal(mapSummaries, cfg);
}

async function summarizeOneChunk(
  chunk: string,
  cfg: DistillConfig,
  llm: { apiKey: string; baseUrl: string; model: string },
): Promise<DistillChunkSummary> {
  if (!llm.apiKey) {
    return summarizeChunkLocal(chunk, cfg);
  }
  const prompt = [
    "请对以下会话片段做结构化蒸馏。",
    `策略: ${cfg.strategy}`,
    `detailLevel: ${cfg.detailLevel}`,
    `factualityMode: ${cfg.factualityMode}`,
    `maxBullets: ${cfg.maxBullets}`,
    "仅抽取明确出现的信息，不允许编造。",
    "输出严格 JSON：goal/decisions/changes/openIssues/nextActions/keyFiles，每个值为字符串数组。",
    "会话片段如下：",
    chunk,
  ].join("\n");
  let lastError: unknown = null;
  for (let i = 0; i <= cfg.maxRetries; i += 1) {
    try {
      const responseText = await callChatCompletionsJsonText({
        baseUrl: llm.baseUrl,
        apiKey: llm.apiKey,
        model: llm.model,
        messages: [
          { role: "system", content: "你是会话蒸馏模型。仅输出 JSON。" },
          { role: "user", content: prompt },
        ],
      });
      const parsed = safeParseSummaryJson(responseText.text);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    return summarizeChunkLocal(chunk, cfg);
  }
  return summarizeChunkLocal(chunk, cfg);
}

function safeParseSummaryJson(text: string): DistillChunkSummary | null {
  try {
    const cleaned = stripMarkdownJsonFence(text);
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    const out: DistillChunkSummary = {
      goal: toStringArray(obj.goal),
      decisions: toStringArray(obj.decisions),
      changes: toStringArray(obj.changes),
      openIssues: toStringArray(obj.openIssues),
      nextActions: toStringArray(obj.nextActions),
      keyFiles: toStringArray(obj.keyFiles),
    };
    return out;
  } catch {
    return null;
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const s = item.trim();
      if (s) {
        out.push(s.slice(0, 300));
      }
    }
  }
  return out;
}

function summarizeChunkLocal(chunk: string, cfg: DistillConfig): DistillChunkSummary {
  const lines = chunk
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, cfg.maxBullets * 4);
  const files = lines
    .flatMap((line) => line.match(/[\w./-]+\.(ts|tsx|js|jsx|json|md|py|go|java|sql)/g) ?? [])
    .slice(0, 20);
  return {
    goal: dedupe(lines.filter((line) => /目标|goal|需求|request/i.test(line)).slice(0, cfg.maxBullets)),
    decisions: dedupe(
      lines.filter((line) => /决定|decision|方案|采用|选择|trade[- ]off/i.test(line)).slice(0, cfg.maxBullets),
    ),
    changes: dedupe(
      lines.filter((line) => /修改|change|update|实现|新增|删除|fix/i.test(line)).slice(0, cfg.maxBullets),
    ),
    openIssues: dedupe(
      lines.filter((line) => /问题|风险|block|todo|待办|未完成|error/i.test(line)).slice(0, cfg.maxBullets),
    ),
    nextActions: dedupe(
      lines.filter((line) => /下一步|next|计划|follow|继续|验证/i.test(line)).slice(0, cfg.maxBullets),
    ),
    keyFiles: dedupe(files),
  };
}

function mergeSummariesLocal(summaries: DistillChunkSummary[], cfg: DistillConfig): DistillChunkSummary {
  return {
    goal: dedupe(summaries.flatMap((s) => s.goal)).slice(0, cfg.maxBullets),
    decisions: dedupe(summaries.flatMap((s) => s.decisions)).slice(0, cfg.maxBullets),
    changes: dedupe(summaries.flatMap((s) => s.changes)).slice(0, cfg.maxBullets),
    openIssues: dedupe(summaries.flatMap((s) => s.openIssues)).slice(0, cfg.maxBullets),
    nextActions: dedupe(summaries.flatMap((s) => s.nextActions)).slice(0, cfg.maxBullets),
    keyFiles: dedupe(summaries.flatMap((s) => s.keyFiles)).slice(0, cfg.maxBullets),
  };
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

async function runInPool<T, R>(items: T[], parallelism: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const ret: R[] = new Array(items.length);
  let cursor = 0;
  const size = Math.max(1, parallelism);
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) {
        break;
      }
      ret[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(workers);
  return ret;
}

function buildDistilledJsonlLines(args: {
  sessionId: string;
  title: string;
  projectPath: string;
  projectName: string;
  agentId: string;
  sourceFiles: string[];
  reduced: DistillChunkSummary;
  cfg: DistillConfig;
}): string[] {
  const now = new Date().toISOString();
  const meta = {
    timestamp: now,
    role: "system",
    type: "distill_meta",
    title: args.title,
    projectPath: args.projectPath,
    projectName: args.projectName,
    agentId: args.agentId,
    sessionId: args.sessionId,
    sourceTag: "distilled",
    sourceFiles: args.sourceFiles,
    config: {
      strategy: args.cfg.strategy,
      detailLevel: args.cfg.detailLevel,
      targetCompressionRatio: args.cfg.targetCompressionRatio,
      factualityMode: args.cfg.factualityMode,
    },
    content: `Distilled from ${args.sourceFiles.length} sessions`,
  };
  const sections = renderSections(args.reduced, args.cfg);
  const summary = {
    timestamp: now,
    role: "assistant",
    type: "distill_summary",
    title: args.title,
    projectPath: args.projectPath,
    agentId: args.agentId,
    content: sections,
  };
  const seedPrompt = {
    timestamp: now,
    role: "user",
    type: "next_prompt_seed",
    title: args.title,
    projectPath: args.projectPath,
    agentId: args.agentId,
    content: "请基于以上蒸馏上下文继续执行，优先处理 openIssues 和 nextActions。",
  };
  return [JSON.stringify(meta), JSON.stringify(summary), JSON.stringify(seedPrompt)];
}

function renderSections(summary: DistillChunkSummary, cfg: DistillConfig): string {
  const blocks: string[] = [];
  const byKey: Record<(typeof SECTION_NAMES)[number], string[]> = {
    goal: summary.goal,
    decisions: summary.decisions,
    changes: summary.changes,
    openIssues: summary.openIssues,
    nextActions: summary.nextActions,
  };
  for (const key of cfg.outputTemplate.sections) {
    const lines = (byKey[key] ?? []).slice(0, cfg.maxBullets);
    if (lines.length === 0) {
      continue;
    }
    blocks.push(`## ${key}`);
    for (const line of lines) {
      blocks.push(`- ${line}`);
    }
  }
  if (summary.keyFiles.length > 0) {
    blocks.push("## keyFiles");
    for (const f of summary.keyFiles.slice(0, cfg.maxBullets)) {
      blocks.push(`- ${f}`);
    }
  }
  if (blocks.length === 0) {
    return "## summary\n- 无可提取信息";
  }
  return blocks.join("\n");
}

function buildFidelityReport(
  source: RawMessage[],
  reduced: DistillChunkSummary,
  cfg: DistillConfig,
): DistillFidelityReport {
  const sourceText = source.map((item) => item.text).join("\n");
  const distilledText = renderSections(reduced, cfg);
  const sourceChars = sourceText.length;
  const distilledChars = distilledText.length;
  const compressionRatio = sourceChars === 0 ? 1 : distilledChars / sourceChars;
  const sourceKeywords = extractKeywords(sourceText);
  const distilledKeywords = extractKeywords(distilledText);
  const distilledKeywordSet = new Set(distilledKeywords);
  const coverageCount = sourceKeywords.filter((kw) => distilledKeywordSet.has(kw)).length;
  const keywordCoverageRatio = sourceKeywords.length === 0 ? 1 : coverageCount / sourceKeywords.length;
  const duplicateRatio = calcDuplicateRatio(distilledText);
  const target = cfg.targetCompressionRatio;
  let lengthDeviationRatio = 0;
  if (target > 0) {
    lengthDeviationRatio = Math.abs(compressionRatio - target) / target;
  }
  const missingSections = cfg.qualityChecks.requireSections.filter((section) => {
    const values = reduced[section];
    return !values || values.length === 0;
  });
  const passCoverage = keywordCoverageRatio >= cfg.qualityChecks.minCoverageRatio;
  const passDup = duplicateRatio <= cfg.qualityChecks.maxDuplicateRatio;
  const passLength = lengthDeviationRatio <= cfg.qualityChecks.maxLengthDeviationRatio;
  const passSection = missingSections.length === 0;
  return {
    sourceSessions: new Set(source.map((item) => item.sourceFile)).size,
    sourceRecords: source.length,
    sourceChars,
    distilledChars,
    compressionRatio,
    keywordCoverageRatio,
    duplicateRatio,
    lengthDeviationRatio,
    missingSections,
    pass: passCoverage && passDup && passLength && passSection,
  };
}

function extractKeywords(text: string): string[] {
  const matches = text.match(/[\p{L}\p{N}_./-]{4,}/gu) ?? [];
  const lowered = matches.map((item) => item.toLowerCase());
  return dedupe(lowered).slice(0, 5000);
}

function calcDuplicateRatio(text: string): number {
  const lines = text
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return 0;
  }
  const unique = new Set(lines);
  return 1 - unique.size / lines.length;
}

export function buildDistillFileName(seed: string): string {
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 8);
  return `distilled-${new Date().toISOString().slice(0, 10)}-${hash}.jsonl`;
}
