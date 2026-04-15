import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchSessionDetail, type SessionDetail } from "../api.js";

export function SessionDetailPage() {
  const { sessionId } = useParams();
  const id = Number(sessionId ?? "");
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) {
      setErr("无效会话 ID");
      return;
    }
    fetchSessionDetail(id)
      .then((data) => {
        setSession(data);
        setErr(null);
      })
      .catch((error) => {
        setErr(error instanceof Error ? error.message : "加载失败");
      });
  }, [id]);

  return (
    <div className="ui-page">
      <p className="ui-back">
        <Link to="/sessions">返回会话列表</Link>
      </p>
      {err ? <p className="ui-error">{err}</p> : null}
      {session ? (
        <SessionDetailBody session={session} />
      ) : null}
    </div>
  );
}

function SessionDetailBody({ session }: { session: SessionDetail }) {
  const toolNames = useMemo(() => extractToolNamesFromSessionContent(session.contentText), [session.contentText]);

  return (
    <div className="ui-stack--sm">
      <h2 className="ui-page-title" style={{ wordBreak: "break-all" }}>
        {session.title || session.sessionId}
      </h2>
      <p className="ui-meta">
        agentId: <code>{session.sourceAgentId}</code> · project: <code>{session.projectPath}</code>
      </p>
      <p className="ui-meta">时间范围：{session.timeStart} ~ {session.timeEnd}</p>
      <p className="ui-meta">
        rawRef: <code>{session.rawRef}</code>
      </p>
      {toolNames.length > 0 ? (
        <div>
          <div className="ui-section-title" style={{ marginBottom: 6 }}>
            本会话使用过的 tools
          </div>
          <div className="ui-chip-row">
            {toolNames.map((name) => (
              <span key={name} className="ui-chip">
                {name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <ChatTimeline contentText={session.contentText} />
      <details className="ui-details">
        <summary>查看原始文本</summary>
        <pre className="ui-pre">{session.contentText}</pre>
      </details>
    </div>
  );
}

type ChatMessage = {
  role: string;
  text: string;
};

function ChatTimeline({ contentText }: { contentText: string }) {
  const messages = parseMessages(contentText);
  if (messages.length === 0) {
    return <p className="ui-hint" style={{ marginTop: 12 }}>未解析到结构化消息，使用下方原始文本查看内容。</p>;
  }

  return (
    <div className="ui-chat">
      {messages.map((msg, idx) => {
        const isUser = isUserRole(msg.role);
        const roleLabel = msg.role || "entry";
        const rowClass = isUser ? "ui-chat-row ui-chat-row--user" : "ui-chat-row ui-chat-row--other";
        const bubbleClass = isUser ? "ui-chat-bubble ui-chat-bubble--user" : "ui-chat-bubble ui-chat-bubble--other";
        return (
          <div key={`${idx}-${roleLabel}`} className={rowClass}>
            <div className={bubbleClass}>
              <div className="ui-chat-role">{roleLabel}</div>
              <div className="ui-chat-text">{msg.text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function parseMessages(contentText: string): ChatMessage[] {
  return contentText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const matched = line.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (!matched) {
        return { role: "entry", text: line };
      }
      return {
        role: matched[1].trim().toLowerCase(),
        text: matched[2] || "",
      };
    });
}

function isUserRole(role: string): boolean {
  return role === "user" || role === "human";
}

const TOOL_NAME_MAX = 80;

function extractToolNamesFromSessionContent(contentText: string): string[] {
  const found = new Set<string>();

  for (const line of contentText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const bracket = trimmed.match(/^\[[^\]]+\]\s*(.*)$/);
    const payload = bracket ? (bracket[1] ?? "").trim() : trimmed;
    if (payload.startsWith("{") || payload.startsWith("[")) {
      try {
        collectToolNamesFromJson(JSON.parse(payload) as unknown, found);
      } catch {
        collectToolNamesFromRawString(payload, found);
      }
    } else {
      collectToolNamesFromRawString(trimmed, found);
    }
  }

  collectToolNamesFromRawString(contentText, found);

  return Array.from(found).sort((a, b) => a.localeCompare(b));
}

function collectToolNamesFromRawString(text: string, out: Set<string>): void {
  const reFunctionName = /"function"\s*:\s*\{\s*"name"\s*:\s*"([^"\\]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = reFunctionName.exec(text)) !== null) {
    addToolName(m[1], out);
  }
}

function collectToolNamesFromJson(node: unknown, out: Set<string>): void {
  if (node === null || node === undefined) {
    return;
  }
  if (typeof node === "string") {
    if (node.startsWith("{") || node.startsWith("[")) {
      try {
        collectToolNamesFromJson(JSON.parse(node) as unknown, out);
      } catch {
        collectToolNamesFromRawString(node, out);
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectToolNamesFromJson(item, out);
    }
    return;
  }
  if (typeof node !== "object") {
    return;
  }

  const obj = node as Record<string, unknown>;

  if (obj.type === "tool_use" && typeof obj.name === "string") {
    addToolName(obj.name, out);
  }

  const toolCalls = obj.tool_calls;
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      if (!tc || typeof tc !== "object") {
        continue;
      }
      const t = tc as Record<string, unknown>;
      if (typeof t.name === "string") {
        addToolName(t.name, out);
      }
      const fn = t.function;
      if (fn && typeof fn === "object") {
        const fname = (fn as Record<string, unknown>).name;
        if (typeof fname === "string") {
          addToolName(fname, out);
        }
      }
    }
  }

  if (typeof obj.toolName === "string") {
    addToolName(obj.toolName, out);
  }
  if (typeof obj.tool_name === "string") {
    addToolName(obj.tool_name, out);
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      collectToolNamesFromJson(value, out);
    }
  }
}

function addToolName(raw: string, out: Set<string>): void {
  const name = raw.trim();
  if (!name || name.length > TOOL_NAME_MAX) {
    return;
  }
  if (/^[\d\s.-]+$/.test(name)) {
    return;
  }
  out.add(name);
}
