import { createHash } from "node:crypto";
import type { AgenticEvent, SessionDetail } from "@agentic/shared";

export type SessionSyncGranularity = "section";

export type SessionTranscriptConverter = {
  name: string;
  canHandle: (session: SessionDetail) => boolean;
  toEvents: (session: SessionDetail, ctx: ConvertContext) => AgenticEvent[];
};

type ConvertContext = {
  runId: string;
  startSeq: number;
  granularity: SessionSyncGranularity;
};

type ParsedMessage = {
  role: string;
  text: string;
};

const MAX_EVENT_TEXT = 4000;

export function convertSessionsToEvents(
  sessions: SessionDetail[],
  opts: { runId: string; granularity: SessionSyncGranularity },
): AgenticEvent[] {
  const orderedSessions = [...sessions].sort((a, b) => {
    const ta = new Date(a.timeStart || a.timeEnd || a.updatedAt).getTime();
    const tb = new Date(b.timeStart || b.timeEnd || b.updatedAt).getTime();
    if (ta !== tb) {
      return ta - tb;
    }
    return a.id - b.id;
  });
  const converters = getConverters();
  const rawEvents: AgenticEvent[] = [];
  let seq = 0;
  for (const session of orderedSessions) {
    const converter = pickConverter(session, converters);
    const converted = converter.toEvents(session, {
      runId: opts.runId,
      startSeq: seq,
      granularity: opts.granularity,
    });
    for (const item of converted) {
      rawEvents.push(item);
      seq = item.seq + 1;
    }
  }
  return mergeAndResequence(rawEvents, opts.runId);
}

export function buildSessionSyncRunId(sessionIds: number[]): string {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const hash = createHash("sha1").update(sessionIds.join(",")).digest("hex").slice(0, 8);
  return `session-sync-${ts}-${hash}`;
}

function pickConverter(
  session: SessionDetail,
  converters: SessionTranscriptConverter[],
): SessionTranscriptConverter {
  for (const converter of converters) {
    if (converter.canHandle(session)) {
      return converter;
    }
  }
  return converters[converters.length - 1];
}

function getConverters(): SessionTranscriptConverter[] {
  return [distilledConverter, bracketLocalConverter, bracketFallbackConverter];
}

function isBracketLocalSourceType(sourceType: string): boolean {
  return sourceType.endsWith("_local");
}

const distilledConverter: SessionTranscriptConverter = {
  name: "distilled",
  canHandle: (session) => {
    const ref = session.rawRef.toLowerCase();
    if (ref.includes("/distilled/")) {
      return true;
    }
    return session.contentText.includes("## openIssues") || session.contentText.includes("sourceTag");
  },
  toEvents: (session, ctx) => {
    const blocks = splitMarkdownSections(session.contentText);
    const events: AgenticEvent[] = [];
    let seq = ctx.startSeq;
    for (const block of blocks) {
      const kind = mapDistillSectionKind(block.title);
      const provider = "session-distill";
      events.push({
        runId: ctx.runId,
        agentId: session.sourceAgentId,
        seq,
        provider,
        kind,
        ts: session.timeEnd || session.updatedAt,
        payload: {
          source: "session_distilled",
          sessionId: session.sessionId,
          sessionTitle: session.title,
          section: block.title,
          text: truncate(block.body, MAX_EVENT_TEXT),
          rawRef: session.rawRef,
          projectPath: session.projectPath,
        },
      });
      seq += 1;
    }
    if (events.length === 0) {
      events.push(...bracketSessionToEvents(session, ctx));
    }
    return events;
  },
};

function bracketSessionToEvents(session: SessionDetail, ctx: ConvertContext): AgenticEvent[] {
  const parsed = parseBracketMessages(session.contentText);
  const grouped = groupByRole(parsed);
  const events: AgenticEvent[] = [];
  let seq = ctx.startSeq;
  for (const item of grouped) {
    const kind = mapRoleKind(item.role);
    events.push({
      runId: ctx.runId,
      agentId: session.sourceAgentId,
      seq,
      provider: "session-index",
      kind,
      ts: session.timeEnd || session.updatedAt,
      payload: {
        source: "session_index",
        sessionId: session.sessionId,
        sessionTitle: session.title,
        role: item.role,
        text: truncate(item.text, MAX_EVENT_TEXT),
        rawRef: session.rawRef,
        projectPath: session.projectPath,
      },
    });
    seq += 1;
  }
  return events;
}

const bracketLocalConverter: SessionTranscriptConverter = {
  name: "bracket_local",
  canHandle: (session) => isBracketLocalSourceType(session.sourceType),
  toEvents: (session, ctx) => bracketSessionToEvents(session, ctx),
};

const bracketFallbackConverter: SessionTranscriptConverter = {
  name: "bracket_fallback",
  canHandle: () => true,
  toEvents: (session, ctx) => bracketSessionToEvents(session, ctx),
};

function parseBracketMessages(content: string): ParsedMessage[] {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const out: ParsedMessage[] = [];
  for (const line of lines) {
    const matched = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (!matched) {
      out.push({ role: "entry", text: line });
      continue;
    }
    out.push({ role: matched[1].trim().toLowerCase(), text: matched[2] ?? "" });
  }
  return out;
}

function groupByRole(messages: ParsedMessage[]): ParsedMessage[] {
  const out: ParsedMessage[] = [];
  for (const item of messages) {
    if (item.text.trim().length === 0) {
      continue;
    }
    const prev = out[out.length - 1];
    if (prev && prev.role === item.role) {
      prev.text = `${prev.text}\n${item.text}`;
      continue;
    }
    out.push({ role: item.role, text: item.text });
  }
  return out;
}

function splitMarkdownSections(content: string): Array<{ title: string; body: string }> {
  const lines = content.split("\n");
  const out: Array<{ title: string; body: string }> = [];
  let currentTitle = "summary";
  let buffer: string[] = [];
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) {
      if (buffer.length > 0) {
        out.push({ title: currentTitle, body: buffer.join("\n").trim() });
      }
      currentTitle = m[1].trim();
      buffer = [];
      continue;
    }
    buffer.push(line);
  }
  if (buffer.length > 0) {
    out.push({ title: currentTitle, body: buffer.join("\n").trim() });
  }
  return out.filter((item) => item.body.length > 0);
}

function mapDistillSectionKind(title: string): AgenticEvent["kind"] {
  const t = title.toLowerCase();
  if (t.includes("next")) {
    return "cli";
  }
  if (t.includes("issue") || t.includes("goal")) {
    return "meta";
  }
  return "llm";
}

function mapRoleKind(role: string): AgenticEvent["kind"] {
  const r = role.toLowerCase();
  if (r === "user" || r === "human") {
    return "cli";
  }
  if (r === "assistant" || r === "model") {
    return "llm";
  }
  return "meta";
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}\n...[truncated]`;
}

function mergeAndResequence(events: AgenticEvent[], runId: string): AgenticEvent[] {
  if (events.length <= 1) {
    return events.map((event, idx) => ({ ...event, runId, seq: idx }));
  }
  const merged: AgenticEvent[] = [];
  for (const event of events) {
    const prev = merged[merged.length - 1];
    if (!prev || !canMergeEvent(prev, event)) {
      merged.push({ ...event });
      continue;
    }
    const prevText = typeof prev.payload.text === "string" ? prev.payload.text : "";
    const currText = typeof event.payload.text === "string" ? event.payload.text : "";
    const joined = prevText ? `${prevText}\n${currText}` : currText;
    prev.payload = {
      ...prev.payload,
      text: truncate(joined, MAX_EVENT_TEXT),
    };
    prev.ts = event.ts;
  }
  return merged.map((event, idx) => ({
    ...event,
    runId,
    seq: idx,
  }));
}

function canMergeEvent(a: AgenticEvent, b: AgenticEvent): boolean {
  if (a.agentId !== b.agentId) {
    return false;
  }
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.provider !== b.provider) {
    return false;
  }
  const aSource = typeof a.payload.source === "string" ? a.payload.source : "";
  const bSource = typeof b.payload.source === "string" ? b.payload.source : "";
  if (aSource !== bSource) {
    return false;
  }
  if (a.kind === "meta") {
    return false;
  }
  return true;
}
