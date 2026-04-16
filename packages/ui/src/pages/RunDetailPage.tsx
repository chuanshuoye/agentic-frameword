import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  HarnessReviewResponse,
  SkillBundle,
  SkillFormat,
  SkillGenerateResponse,
} from "@agentic/shared";
import {
  apiBase,
  fetchEvents,
  generateSkill,
  openEventsStream,
  planSkill,
  runHarnessReview,
  saveSkillRecords,
  type StoredEvent,
} from "../api.js";
import { downloadSkillBundlesZip } from "../utils/downloadSkillBundles.js";

const HARNESS_FAILURE_TYPE_LABEL: Record<string, string> = {
  tool_error: "工具错误",
  policy_violation: "策略违规",
  missing_prereq: "前置条件缺失",
  rollback_missing: "缺少回滚",
  instruction_drift: "指令漂移",
  handoff_break: "交接中断",
  other: "其他",
};

function harnessFailureTypeLabel(t: string): string {
  return HARNESS_FAILURE_TYPE_LABEL[t] ?? t;
}

function harnessSeverityLabel(s: string): string {
  if (s === "low") {
    return "低";
  }
  if (s === "medium") {
    return "中";
  }
  if (s === "high") {
    return "高";
  }
  return s;
}

function harnessWriteModeLabel(m: string): string {
  if (m === "dry_run") {
    return "仅预览";
  }
  if (m === "write_agent_md") {
    return "写入 AGENT.md";
  }
  return m;
}

function PayloadBlock({ payload }: { payload: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const text = JSON.stringify(payload, null, 2);
  const preview = text.length > 600 ? `${text.slice(0, 600)}…` : text;
  const preClass = open ? "ui-pre ui-pre--json ui-pre--json-open" : "ui-pre ui-pre--json";
  return (
    <div>
      <button className="ui-btn" type="button" onClick={() => setOpen(!open)}>
        {open ? "收起载荷" : "展开载荷"}
      </button>
      <pre className={preClass}>{open ? text : preview}</pre>
    </div>
  );
}

export function RunDetailPage() {
  const { runId: runIdParam } = useParams();
  const runId = runIdParam ? decodeURIComponent(runIdParam) : "";
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [agentId, setAgentId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [useStream, setUseStream] = useState(false);
  const [skillGoal, setSkillGoal] = useState("");
  const [skillAgentPick, setSkillAgentPick] = useState<Set<string>>(() => new Set());
  const [skillApiKey, setSkillApiKey] = useState("");
  const [skillBusy, setSkillBusy] = useState(false);
  const [skillPlanBusy, setSkillPlanBusy] = useState(false);
  const [skillPlanErr, setSkillPlanErr] = useState<string | null>(null);
  const [skillPlanUserHint, setSkillPlanUserHint] = useState("");
  const [skillErr, setSkillErr] = useState<string | null>(null);
  const [skillLastWarnings, setSkillLastWarnings] = useState<string[] | null>(null);
  const [skillLastGenerate, setSkillLastGenerate] = useState<SkillGenerateResponse | null>(null);
  const [skillSaveBusy, setSkillSaveBusy] = useState(false);
  const [skillSaveErr, setSkillSaveErr] = useState<string | null>(null);
  const [skillSaveIds, setSkillSaveIds] = useState<number[] | null>(null);
  const [skillFormat, setSkillFormat] = useState<SkillFormat>("cursor");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewErr, setReviewErr] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<HarnessReviewResponse | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewMaxEvents, setReviewMaxEvents] = useState("");

  const agentOptions = useMemo(() => {
    const s = new Set<string>();
    for (const e of events) {
      s.add(e.agentId);
    }
    return Array.from(s).sort();
  }, [events]);

  useEffect(() => {
    setSkillAgentPick((prev) => {
      if (agentOptions.length === 0) {
        return new Set();
      }
      if (prev.size === 0) {
        return new Set(agentOptions);
      }
      const next = new Set<string>();
      for (const a of agentOptions) {
        if (prev.has(a)) {
          next.add(a);
        }
      }
      if (next.size === 0) {
        return new Set(agentOptions);
      }
      return next;
    });
  }, [agentOptions]);

  useEffect(() => {
    setSkillLastGenerate(null);
    setSkillSaveErr(null);
    setSkillSaveIds(null);
    setSkillPlanErr(null);
    setReviewResult(null);
    setReviewErr(null);
  }, [runId]);

  const skillAgentIdsParam = useMemo((): string[] | undefined => {
    if (agentOptions.length === 0) {
      return undefined;
    }
    const picked = agentOptions.filter((a) => skillAgentPick.has(a));
    if (picked.length === 0 || picked.length === agentOptions.length) {
      return undefined;
    }
    return picked;
  }, [agentOptions, skillAgentPick]);

  const hasIngestToken = Boolean(
    (import.meta.env.VITE_AGENTIC_SERVER_TOKEN as string | undefined)?.trim(),
  );

  async function onDownloadSkillBundles(
    bundles: SkillBundle[],
    runIdForName: string,
  ) {
    const safeRun = runIdForName.replace(/[^\w.-]+/g, "_").slice(0, 24);
    await downloadSkillBundlesZip({
      bundles,
      zipName: `skills-${safeRun}.zip`,
    });
  }

  async function onSaveSkillLibrary(generated: SkillGenerateResponse) {
    setSkillSaveErr(null);
    if (!hasIngestToken) {
      setSkillSaveErr("未配置鉴权 Token，无法保存");
      return;
    }
    setSkillSaveBusy(true);
    try {
      const res = await saveSkillRecords({
        runId,
        bundles: generated.bundles,
        generationMeta: generated.generationMeta,
      });
      setSkillSaveIds(res.ids);
    } catch (e) {
      setSkillSaveErr(e instanceof Error ? e.message : "保存失败");
      setSkillSaveIds(null);
    } finally {
      setSkillSaveBusy(false);
    }
  }

  async function onPlanSkill() {
    setSkillPlanErr(null);
    if (events.length === 0) {
      setSkillPlanErr("当前没有观测事件，无法从运行记录提炼目标任务");
      return;
    }
    if (!hasIngestToken) {
      setSkillPlanErr("未配置 VITE_AGENTIC_SERVER_TOKEN / AGENTIC_SERVER_TOKEN，无法调用鉴权接口");
      return;
    }
    setSkillPlanBusy(true);
    try {
      const body = {
        agentIds: skillAgentIdsParam,
        apiKey: skillApiKey.trim() || undefined,
        userHint: skillPlanUserHint.trim() || undefined,
      };
      const text = await planSkill(runId, body);
      setSkillGoal(text);
    } catch (e) {
      setSkillPlanErr(e instanceof Error ? e.message : "提炼失败");
    } finally {
      setSkillPlanBusy(false);
    }
  }

  async function onGenerateSkill() {
    setSkillErr(null);
    setSkillLastWarnings(null);
    setSkillLastGenerate(null);
    setSkillSaveErr(null);
    setSkillSaveIds(null);
    if (!skillGoal.trim()) {
      setSkillErr("请填写目标任务描述");
      return;
    }
    if (!hasIngestToken) {
      setSkillErr("未配置 VITE_AGENTIC_SERVER_TOKEN / AGENTIC_SERVER_TOKEN，无法调用鉴权接口");
      return;
    }
    setSkillBusy(true);
    try {
      const body = {
        userGoal: skillGoal.trim(),
        agentIds: skillAgentIdsParam,
        formats: [skillFormat],
        apiKey: skillApiKey.trim() || undefined,
      };
      const res = await generateSkill(runId, body);
      setSkillLastGenerate(res);
      setSkillLastWarnings(res.warnings ?? null);
      await onDownloadSkillBundles(res.bundles, runId);
      await onSaveSkillLibrary(res);
    } catch (e) {
      setSkillErr(e instanceof Error ? e.message : "生成失败");
    } finally {
      setSkillBusy(false);
    }
  }

  async function onHarnessReview(mode: "dry_run" | "write_agent_md") {
    setReviewErr(null);
    if (events.length === 0) {
      setReviewErr("当前没有观测事件，无法复盘");
      return;
    }
    if (!hasIngestToken) {
      setReviewErr("未配置 VITE_AGENTIC_SERVER_TOKEN / AGENTIC_SERVER_TOKEN，无法调用鉴权接口");
      return;
    }
    let maxContextEvents: number | undefined;
    const maxEvRaw = reviewMaxEvents.trim();
    if (maxEvRaw.length > 0) {
      const n = Number.parseInt(maxEvRaw, 10);
      if (Number.isNaN(n) || n < 1 || n > 500) {
        setReviewErr("参与复盘的最大事件条数须为 1–500 的整数，或留空使用服务端默认");
        return;
      }
      maxContextEvents = n;
    }
    setReviewBusy(true);
    try {
      const body = {
        note: reviewNote.trim() || undefined,
        agentIds: skillAgentIdsParam,
        maxContextEvents,
        apiKey: skillApiKey.trim() || undefined,
        mode,
      };
      const res = await runHarnessReview(runId, body);
      setReviewResult(res);
    } catch (e) {
      setReviewResult(null);
      setReviewErr(e instanceof Error ? e.message : "复盘失败");
    } finally {
      setReviewBusy(false);
    }
  }

  useEffect(() => {
    if (!runId || useStream) {
      return;
    }
    let cancelled = false;
    void fetchEvents(runId, { agentId: agentId || undefined })
      .then((data) => {
        if (!cancelled) {
          setEvents(data);
          setErr(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErr(`无法连接 ${apiBase}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [runId, agentId, useStream]);

  useEffect(() => {
    if (!runId || !useStream) {
      return;
    }
    let cancelled = false;
    setEvents([]);
    const es = openEventsStream(runId, { agentId: agentId || undefined, sinceSeq: -1 });
    es.addEventListener("event", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data as string) as StoredEvent;
        if (cancelled) {
          return;
        }
        setEvents((prev) => mergeBySeq(prev, [data]));
        setErr(null);
      } catch {
        if (!cancelled) {
          setErr("SSE 解析失败");
        }
      }
    });
    es.onerror = () => {
      if (!cancelled) {
        setErr("SSE 连接中断");
      }
    };
    return () => {
      cancelled = true;
      es.close();
    };
  }, [runId, agentId, useStream]);

  if (!runId) {
    return (
      <div className="ui-page">
        <p className="ui-hint">缺少 runId</p>
      </div>
    );
  }

  return (
    <div className="ui-page">
      <p className="ui-back">
        <Link to="/">返回列表</Link>
      </p>
      <h2 className="ui-page-title" style={{ wordBreak: "break-all" }}>
        Agent回溯：{runId}
      </h2>
      <p className="ui-meta" style={{ marginTop: 0, marginBottom: 12 }}>
        当前 {events.length} 条事件
      </p>

      <section className="ui-section" style={{ marginBottom: 12 }}>
        <h3>公共配置</h3>
        <p className="ui-meta" style={{ marginTop: 0 }}>
          观测拉流、技能生成（提炼与打包）与失败复盘共用：智能体过滤、事件流、参与复盘的智能体多选、临时大模型密钥。
        </p>
        <div className="ui-toolbar-inline" style={{ marginBottom: 0 }}>
          <label className="ui-check">
            智能体过滤{" "}
            <select className="ui-select ui-select--compact" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">全部</option>
              {agentOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="ui-check">
            <input type="checkbox" checked={useStream} onChange={(e) => setUseStream(e.target.checked)} />
            使用 SSE（实验）
          </label>
        </div>
        {!hasIngestToken ? (
          <p className="ui-meta" style={{ marginTop: 8 }}>
            未配置 Token 时部分按钮禁用；请在环境变量中设置 VITE_AGENTIC_SERVER_TOKEN。
          </p>
        ) : null}
        {agentOptions.length > 0 ? (
          <fieldset style={{ marginTop: 10, marginBottom: 10, border: "none", padding: 0 }}>
            <legend className="ui-meta" style={{ marginBottom: 6 }}>
              参与生成与复盘的智能体（全选表示不按智能体筛选）
            </legend>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {agentOptions.map((a) => (
                <label key={a} className="ui-check" style={{ fontSize: "0.8125rem" }}>
                  <input
                    type="checkbox"
                    checked={skillAgentPick.has(a)}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setSkillAgentPick((prev) => {
                        const next = new Set(prev);
                        if (on) {
                          next.add(a);
                        } else {
                          next.delete(a);
                        }
                        return next;
                      });
                    }}
                  />
                  <span style={{ wordBreak: "break-all" }}>{a}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <label style={{ display: "block" }}>
          <div className="ui-meta" style={{ marginBottom: 4 }}>
            临时大模型密钥（可选）
          </div>
          <input
            className="ui-input"
            type="password"
            value={skillApiKey}
            onChange={(e) => setSkillApiKey(e.target.value)}
            autoComplete="off"
            style={{ maxWidth: 480, width: "100%" }}
            placeholder="覆盖服务端环境变量中的大模型密钥，仅本次请求有效"
          />
        </label>
      </section>

      <div className="run-workbench">
        <div className="run-workbench-events">
          <h3>观测事件</h3>
          {err ? <p className="ui-error">{err}</p> : null}
          <ol className="ui-event-list">
            {[...events]
              .sort((a, b) => a.seq - b.seq)
              .map((e) => (
                <li key={`${e.agentId}-${e.seq}-${e.id}`}>
                  <div className="ui-meta">
                    序号 {e.seq} · 类型 {e.kind} · 渠道 {e.provider} · 智能体 {e.agentId} · 时间 {e.ts}
                  </div>
                  <PayloadBlock payload={e.payload} />
                </li>
              ))}
          </ol>
        </div>
        <div className="run-workbench-panels">
      <section className="ui-section">
        <h3>生成技能（提炼 → 打包）</h3>
        <p className="ui-meta" style={{ marginTop: 0 }}>
          使用上方「公共配置」中的智能体与临时大模型密钥。第一步「提炼」读取当前运行观测并输出目标任务描述（纯文本）；第二步「打包」仅根据该描述生成所选范式的
          SKILL.md 等。压缩包内按 <code>cursor/&lt;skillId&gt;/</code> 与 <code>claude/&lt;skillId&gt;/</code>{" "}
          分目录存放。需携带鉴权令牌（环境变量 VITE_AGENTIC_SERVER_TOKEN 或 AGENTIC_SERVER_TOKEN）。
        </p>
        <fieldset style={{ marginBottom: 12, border: "none", padding: 0 }}>
          <legend className="ui-meta" style={{ marginBottom: 6 }}>
            目标范式（单选）
          </legend>
          <div style={{ display: "flex", gap: 16 }}>
            <label className="ui-check" style={{ fontSize: "0.8125rem" }}>
              <input
                type="radio"
                name="skill-format"
                checked={skillFormat === "cursor"}
                onChange={() => setSkillFormat("cursor")}
              />
              Cursor 技能（.cursor/skills/）
            </label>
            <label className="ui-check" style={{ fontSize: "0.8125rem" }}>
              <input
                type="radio"
                name="skill-format"
                checked={skillFormat === "claude"}
                onChange={() => setSkillFormat("claude")}
              />
              Claude 技能（.claude/skills/）
            </label>
          </div>
        </fieldset>
        <label style={{ display: "block", marginBottom: 8 }}>
          <div className="ui-meta" style={{ marginBottom: 4 }}>
            目标任务描述（可先点「从运行记录提炼」或手写）
          </div>
          <textarea
            className="ui-textarea"
            value={skillGoal}
            onChange={(e) => setSkillGoal(e.target.value)}
            rows={4}
            style={{ maxWidth: 720 }}
            placeholder="描述希望沉淀的能力、使用场景与约束"
          />
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          <div className="ui-meta" style={{ marginBottom: 4 }}>
            提炼补充说明（可选）
          </div>
          <input
            className="ui-input"
            value={skillPlanUserHint}
            onChange={(e) => setSkillPlanUserHint(e.target.value)}
            style={{ maxWidth: 720, width: "100%" }}
            placeholder="例如：侧重 CLI 步骤 / 关注回滚与安全"
          />
        </label>
        <button
          className="ui-btn"
          type="button"
          disabled={skillPlanBusy || events.length === 0 || !hasIngestToken}
          onClick={() => void onPlanSkill()}
        >
          {skillPlanBusy ? "提炼中…" : "从运行记录提炼目标任务"}
        </button>
        <button
          className="ui-btn"
          type="button"
          style={{ marginLeft: 8 }}
          disabled={skillBusy}
          onClick={() => void onGenerateSkill()}
        >
          {skillBusy ? "生成中…" : "生成并下载压缩包"}
        </button>
        {skillLastGenerate ? (
          <span className="ui-meta" style={{ marginLeft: 8 }}>
            {skillSaveBusy ? "已生成，保存中…" : "已生成并自动保存，可前往 "}
            <Link to="/skills">技能库</Link>
          </span>
        ) : null}
        {skillPlanErr ? <p className="ui-error" style={{ marginTop: 8 }}>{skillPlanErr}</p> : null}
        {skillErr ? <p className="ui-error" style={{ marginTop: 8 }}>{skillErr}</p> : null}
        {skillSaveErr ? <p className="ui-error" style={{ marginTop: 8 }}>{skillSaveErr}</p> : null}
        {skillSaveIds && skillSaveIds.length > 0 ? (
          <p className="ui-meta" style={{ marginTop: 8 }}>
            已保存编号：{skillSaveIds.join(", ")} ·{" "}
            <Link to={`/skills/${skillSaveIds[0]}`}>查看首条</Link>
          </p>
        ) : null}
        {skillLastWarnings && skillLastWarnings.length > 0 ? (
          <ul className="ui-status-warn" style={{ marginTop: 8, paddingLeft: "1.25rem" }}>
            {skillLastWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}
      </section>
      <section className="ui-section">
        <h3>运行失败复盘</h3>
        <p className="ui-meta" style={{ marginTop: 0 }}>
          调用 <code>POST /v1/runs/:runId/reviews</code>：仅预览模式不写盘；写入模式将合并到仓库根目录{" "}
          <code>AGENT.md</code>。智能体多选与临时大模型密钥见上方「公共配置」。
        </p>
        <label style={{ display: "block", marginBottom: 8 }}>
          <div className="ui-meta" style={{ marginBottom: 4 }}>
            复盘补充说明（可选）
          </div>
          <textarea
            className="ui-textarea"
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            rows={3}
            style={{ maxWidth: 720 }}
            placeholder="例如：关注某次工具调用失败与回滚策略"
          />
        </label>
        <label style={{ display: "block", marginBottom: 10 }}>
          <div className="ui-meta" style={{ marginBottom: 4 }}>
            参与复盘的最大事件条数（可选，1–500，留空则使用服务端默认）
          </div>
          <input
            className="ui-input"
            type="number"
            min={1}
            max={500}
            value={reviewMaxEvents}
            onChange={(e) => setReviewMaxEvents(e.target.value)}
            style={{ maxWidth: 200, width: "100%" }}
            placeholder="例如 80"
          />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <button
            className="ui-btn"
            type="button"
            disabled={reviewBusy || events.length === 0 || !hasIngestToken}
            onClick={() => void onHarnessReview("dry_run")}
          >
            {reviewBusy ? "处理中…" : "仅预览（不写盘）"}
          </button>
          <button
            className="ui-btn"
            type="button"
            disabled={reviewBusy || events.length === 0 || !hasIngestToken}
            onClick={() => void onHarnessReview("write_agent_md")}
          >
            {reviewBusy ? "处理中…" : "复盘并写入 AGENT.md"}
          </button>
        </div>
        {events.length === 0 ? <p className="ui-meta">当前无事件，无法复盘。</p> : null}
        {reviewErr ? <p className="ui-error" style={{ marginTop: 8 }}>{reviewErr}</p> : null}
        {reviewResult ? (
          <div style={{ marginTop: 12 }}>
            <h4 className="ui-meta" style={{ margin: "0 0 8px" }}>
              摘要
            </h4>
            <p style={{ margin: "0 0 12px", whiteSpace: "pre-wrap" }}>{reviewResult.summary}</p>
            <h4 className="ui-meta" style={{ margin: "0 0 8px" }}>
              失败用例（{reviewResult.cases.length}）
            </h4>
            {reviewResult.cases.length === 0 ? (
              <p className="ui-meta">无失败用例</p>
            ) : (
              <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
                {reviewResult.cases.map((c) => (
                  <li key={c.caseId} style={{ marginBottom: 10 }}>
                    <div className="ui-meta">
                      <strong>{c.caseId}</strong> · {harnessFailureTypeLabel(c.failureType)} · 严重程度{" "}
                      {harnessSeverityLabel(c.severity)}
                      {c.agentId ? ` · 智能体 ${c.agentId}` : ""}
                    </div>
                    <div style={{ marginTop: 4 }}>{c.symptom}</div>
                    <details style={{ marginTop: 6 }}>
                      <summary className="ui-meta" style={{ cursor: "pointer" }}>
                        证据 / 根因假设 / 修复与护栏
                      </summary>
                      <div style={{ marginTop: 8, fontSize: "0.875rem" }}>
                        <div className="ui-meta" style={{ marginBottom: 4 }}>
                          证据
                        </div>
                        <ul style={{ paddingLeft: "1.25rem", margin: "0 0 8px" }}>
                          {c.evidence.map((line, i) => (
                            <li key={i} style={{ whiteSpace: "pre-wrap" }}>
                              {line}
                            </li>
                          ))}
                        </ul>
                        <div className="ui-meta" style={{ marginBottom: 4 }}>
                          根因假设
                        </div>
                        <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{c.rootCauseHypothesis}</p>
                        <div className="ui-meta" style={{ marginBottom: 4 }}>
                          修复建议
                        </div>
                        <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{c.recoveryFix}</p>
                        <div className="ui-meta" style={{ marginBottom: 4 }}>
                          护栏
                        </div>
                        <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
                          {c.guardrails.map((g, i) => (
                            <li key={i}>{g}</li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
            <h4 className="ui-meta" style={{ margin: "12px 0 8px" }}>
              写入结果
            </h4>
            <p className="ui-meta" style={{ margin: 0 }}>
              模式 {harnessWriteModeLabel(reviewResult.writeResult.mode)} · 路径 {reviewResult.writeResult.path} ·
              是否已更新 {reviewResult.writeResult.updated ? "是" : "否"} · 新增条数 {reviewResult.writeResult.inserted}{" "}
              · 合并条数 {reviewResult.writeResult.merged}
            </p>
          </div>
        ) : null}
      </section>
        </div>
      </div>
    </div>
  );
}

function mergeBySeq(prev: StoredEvent[], incoming: StoredEvent[]): StoredEvent[] {
  const map = new Map<string, StoredEvent>();
  for (const e of prev) {
    map.set(keyOf(e), e);
  }
  for (const e of incoming) {
    map.set(keyOf(e), e);
  }
  return Array.from(map.values());
}

function keyOf(e: StoredEvent): string {
  return `${e.runId}:${e.agentId}:${e.seq}`;
}
