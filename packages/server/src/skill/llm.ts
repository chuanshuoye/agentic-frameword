import { SkillGenerateError } from "./errors.js";
import { safeSerializeBody, writeApiLog } from "../logging/apiLog.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type SkillLlmAttemptMode =
  | "json_schema"
  | "json_mode"
  | "fallback_plain"
  | "plain_text"
  | "repair_pass";
export type SkillLlmAttemptMeta = {
  mode: SkillLlmAttemptMode;
  ok: boolean;
  status?: number | null;
};

export type SkillLlmCallOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  jsonSchema?: Record<string, unknown>;
};

async function fetchWithApiLog(args: {
  url: string;
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
  attempt: SkillLlmAttemptMode;
}): Promise<Response> {
  const startedAt = Date.now();
  let response: Response | undefined;
  let errorMessage: string | null = null;
  let responsePreview: string | null = null;

  try {
    response = await fetch(args.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify(args.body),
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json") || contentType.startsWith("text/")) {
      responsePreview = await response
        .clone()
        .text()
        .then((text) => text.slice(0, 1000))
        .catch(() => null);
    }
    return response;
  } catch (error) {
    errorMessage = String(error);
    throw error;
  } finally {
    void writeApiLog({
      direction: "outbound",
      kind: "llm_chat_completions",
      target: args.url,
      provider: "openai-compatible",
      model: args.model,
      attempt: args.attempt,
      requestBody: safeSerializeBody(args.body),
      status: response?.status ?? null,
      responseBody: safeSerializeBody(responsePreview),
      durationMs: Date.now() - startedAt,
      error: errorMessage,
    });
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

/**
 * DeepSeek 官方主路径为 `/chat/completions`（见 api-docs）；部分环境下 `/v1/chat/completions` 会误报 Model Not Exist。
 * 其他厂商仍使用 `{base}/chat/completions`（base 通常含 `/v1`）。
 */
function resolveChatCompletionsUrl(baseUrl: string): string {
  const b = normalizeBaseUrl(baseUrl);
  try {
    const u = new URL(b);
    if (u.hostname === "api.deepseek.com") {
      return "https://api.deepseek.com/chat/completions";
    }
  } catch {
    // ignore
  }
  return `${b}/chat/completions`;
}

function parseUpstreamErrorBody(text: string): { message?: string; code?: string } {
  try {
    const j = JSON.parse(text) as { error?: { message?: string; code?: string } };
    return { message: j.error?.message, code: j.error?.code };
  } catch {
    return {};
  }
}

/**
 * OpenAI 兼容 Chat Completions。优先使用 json_object；若服务端不支持则回落为普通文本解析。
 */
export async function callChatCompletionsJsonText(
  opts: SkillLlmCallOptions,
): Promise<{ text: string; attempts: SkillLlmAttemptMeta[] }> {
  const url = resolveChatCompletionsUrl(opts.baseUrl);
  const attempts: SkillLlmAttemptMeta[] = [];
  const bodyBase = {
    model: opts.model,
    messages: opts.messages,
    temperature: 0.2,
  };

  let res: Response | null = null;
  if (opts.jsonSchema) {
    const withSchemaMode = {
      ...bodyBase,
      response_format: {
        type: "json_schema" as const,
        json_schema: {
          name: "skill_bundle_response",
          schema: opts.jsonSchema,
        },
      },
    };
    res = await fetchWithApiLog({
      url,
      apiKey: opts.apiKey,
      model: opts.model,
      body: withSchemaMode as Record<string, unknown>,
      attempt: "json_schema",
    });
    attempts.push({ mode: "json_schema", ok: res.ok, status: res.status });
  }

  if (!res || (!res.ok && res.status === 400)) {
    const withJsonMode = { ...bodyBase, response_format: { type: "json_object" as const } };
    res = await fetchWithApiLog({
      url,
      apiKey: opts.apiKey,
      model: opts.model,
      body: withJsonMode as Record<string, unknown>,
      attempt: "json_mode",
    });
    attempts.push({ mode: "json_mode", ok: res.ok, status: res.status });
  }

  if (!res.ok && res.status === 400) {
    res = await fetchWithApiLog({
      url,
      apiKey: opts.apiKey,
      model: opts.model,
      body: bodyBase as Record<string, unknown>,
      attempt: "fallback_plain",
    });
    attempts.push({ mode: "fallback_plain", ok: res.ok, status: res.status });
  }

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const parsed = parseUpstreamErrorBody(t);
    const msg = parsed.message ?? t.slice(0, 300);
    if (
      res.status === 400 &&
      (/model not exist/i.test(msg) || /model.*not found/i.test(msg) || /invalid model/i.test(msg))
    ) {
      throw new SkillGenerateError(
        400,
        "llm_model_mismatch",
        `${msg}。请核对 AGENTIC_SKILL_LLM_MODEL 与 AGENTIC_SKILL_LLM_BASE_URL 是否同属一家服务（DeepSeek 官方常用 deepseek-chat + https://api.deepseek.com；OpenAI 示例为 gpt-4o-mini + https://api.openai.com/v1）。`,
      );
    }
    if (res.status === 400) {
      throw new SkillGenerateError(400, "llm_bad_request", msg);
    }
    throw new SkillGenerateError(502, "llm_http_error", `upstream_${res.status}:${t.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new SkillGenerateError(502, "llm_empty_content", "empty_completion");
  }
  void writeApiLog({
    direction: "outbound",
    kind: "llm_chat_completions_result",
    target: url,
    provider: "openai-compatible",
    model: opts.model,
    status: res.status,
    responseBody: safeSerializeBody(text.slice(0, 2000)),
  });
  return { text, attempts };
}

/** 普通文本补全：不设置 response_format，适用于 Plan 等无需 JSON 外壳的场景 */
export async function callChatCompletionsPlainText(
  opts: Omit<SkillLlmCallOptions, "jsonSchema">,
): Promise<{ text: string; attempts: SkillLlmAttemptMeta[] }> {
  const url = resolveChatCompletionsUrl(opts.baseUrl);
  const attempts: SkillLlmAttemptMeta[] = [];
  const bodyBase = {
    model: opts.model,
    messages: opts.messages,
    temperature: 0.2,
  };

  const res = await fetchWithApiLog({
    url,
    apiKey: opts.apiKey,
    model: opts.model,
    body: bodyBase as Record<string, unknown>,
    attempt: "plain_text",
  });
  attempts.push({ mode: "plain_text", ok: res.ok, status: res.status });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const parsed = parseUpstreamErrorBody(t);
    const msg = parsed.message ?? t.slice(0, 300);
    if (res.status === 400) {
      throw new SkillGenerateError(400, "llm_bad_request", msg);
    }
    throw new SkillGenerateError(502, "llm_http_error", `upstream_${res.status}:${t.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new SkillGenerateError(502, "llm_empty_content", "empty_completion");
  }
  void writeApiLog({
    direction: "outbound",
    kind: "llm_chat_completions_result",
    target: url,
    provider: "openai-compatible",
    model: opts.model,
    status: res.status,
    responseBody: safeSerializeBody(text.slice(0, 2000)),
  });
  return { text, attempts };
}

export async function repairChatCompletionsJsonText(
  opts: SkillLlmCallOptions,
  lastOutput: string,
  errorSummary: string,
): Promise<{ text: string; attempts: SkillLlmAttemptMeta[] }> {
  const repairMessages: ChatMessage[] = [
    ...opts.messages,
    {
      role: "assistant",
      content: lastOutput.slice(0, 12_000),
    },
    {
      role: "user",
      content: `你的上一条输出未通过 JSON 校验，请仅返回修复后的 JSON 对象，不要解释。\n错误摘要：${errorSummary.slice(0, 1500)}`,
    },
  ];
  const res = await callChatCompletionsJsonText({
    ...opts,
    messages: repairMessages,
  });
  return {
    text: res.text,
    attempts: [{ mode: "repair_pass", ok: true }, ...res.attempts],
  };
}

export function stripMarkdownJsonFence(text: string): string {
  const t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  if (fenced) {
    return fenced[1].trim();
  }
  return t;
}
