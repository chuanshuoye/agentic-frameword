import type { AgenticEvent } from "./schema.js";
import type { SessionProviderId } from "./schema.js";

/** `GET /v1/runs` 列表项 */
export type RunRow = {
  runId: string;
  createdAt: string;
  lastEventAt: string;
  eventCount: number;
};

/** 落库事件行（API 与 store 共用形状） */
export type StoredEvent = AgenticEvent & { id: number };

/** 会话列表行 */
export type SessionRow = {
  id: number;
  projectKey: string;
  sourceType: string;
  sourceAgentId: string;
  sessionId: string;
  title: string;
  timeStart: string;
  timeEnd: string;
  previewExcerpt: string;
  rawRef: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  updatedAt: string;
};

/** 会话详情（含正文与项目信息） */
export type SessionDetail = SessionRow & {
  projectName: string;
  projectPath: string;
  contentText: string;
};

/** 本地项目候选（多源统一结构） */
export type SessionProjectCandidate = {
  provider: SessionProviderId;
  name: string;
  path: string;
  transcriptsDir: string;
  hasTranscripts: boolean;
};

/** 历史命名，与 SessionProjectCandidate 相同 */
export type CursorProjectCandidate = SessionProjectCandidate;

/** `POST .../sessions/distill` 成功响应体 */
export type SessionDistillResult = {
  ok: boolean;
  outputFilePath: string;
  outputDir: string;
  sessionId: string;
  fidelity: {
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
  syncResult?: {
    scannedFiles: number;
    inserted: number;
    updated: number;
    skipped: number;
  };
};
