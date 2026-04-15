import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  createSkillHumanFeedback,
  fetchSkillHumanFeedback,
  fetchSkillRecord,
  fetchSkillVersions,
  regenerateSkillFromFeedback,
  type HumanFeedbackCreateBody,
  type HumanFeedbackListResponse,
  type RegenerateFromFeedbackBody,
  type SkillRecordDetail,
  type SkillVersionListResponse,
} from "../api.js";

type PanelStatus = {
  loading: boolean;
  error: string | null;
};

const DEFAULT_PROBLEM_TYPE_OPTIONS = [
  "instruction_clarity",
  "missing_prerequisites",
  "unsafe_command",
  "low_reusability",
  "output_quality",
];

function resolveProblemTypeOptions(): string[] {
  const raw = (import.meta.env.VITE_SKILL_PROBLEM_TYPES as string | undefined)?.trim();
  if (!raw) {
    return DEFAULT_PROBLEM_TYPE_OPTIONS;
  }
  const parsed = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (parsed.length === 0) {
    return DEFAULT_PROBLEM_TYPE_OPTIONS;
  }
  return Array.from(new Set(parsed));
}

function roleLabel(v: "user" | "reviewer" | "agent"): string {
  if (v === "user") return "用户";
  if (v === "reviewer") return "审核者";
  return "智能体";
}

function sentimentLabel(v: "positive" | "neutral" | "negative"): string {
  if (v === "positive") return "正向";
  if (v === "neutral") return "中性";
  return "负向";
}

function severityLabel(v: "low" | "medium" | "high"): string {
  if (v === "low") return "低";
  if (v === "medium") return "中";
  return "高";
}

export function SkillFeedbackPage() {
  const { skillId: idParam } = useParams();
  const id = idParam ? Number(idParam) : NaN;
  const hasToken = Boolean((import.meta.env.VITE_AGENTIC_SERVER_TOKEN as string | undefined)?.trim());
  const problemTypeOptions = useMemo(() => resolveProblemTypeOptions(), []);
  const [skill, setSkill] = useState<SkillRecordDetail | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<PanelStatus>({ loading: true, error: null });
  const [versionsStatus, setVersionsStatus] = useState<PanelStatus>({ loading: true, error: null });
  const [humanFeedback, setHumanFeedback] = useState<HumanFeedbackListResponse["feedback"]>([]);
  const [versions, setVersions] = useState<SkillVersionListResponse["versions"]>([]);
  const [submitFeedbackBusy, setSubmitFeedbackBusy] = useState(false);
  const [regenerateBusy, setRegenerateBusy] = useState(false);
  const [opMsg, setOpMsg] = useState<string | null>(null);
  const [feedbackForm, setFeedbackForm] = useState<HumanFeedbackCreateBody>({
    role: "user",
    sentiment: "neutral",
    problemType: problemTypeOptions[0] ?? "",
    severity: "medium",
    freeText: "",
    suggestion: "",
    runId: "",
  });
  const [customProblemType, setCustomProblemType] = useState("");
  const [regenerateLimit, setRegenerateLimit] = useState<RegenerateFromFeedbackBody["limit"]>(10);

  async function loadFeedbackPanel(): Promise<void> {
    setFeedbackStatus({ loading: true, error: null });
    try {
      const rows = await fetchSkillHumanFeedback(id, 50);
      setHumanFeedback(rows);
      setFeedbackStatus({ loading: false, error: null });
    } catch {
      setHumanFeedback([]);
      setFeedbackStatus({ loading: false, error: "人工反馈加载失败" });
    }
  }

  async function loadVersionsPanel(): Promise<void> {
    setVersionsStatus({ loading: true, error: null });
    try {
      const rows = await fetchSkillVersions(id);
      setVersions(rows);
      setVersionsStatus({ loading: false, error: null });
    } catch {
      setVersions([]);
      setVersionsStatus({ loading: false, error: "版本链加载失败" });
    }
  }

  useEffect(() => {
    if (!Number.isFinite(id) || id < 1 || !hasToken) {
      return;
    }
    fetchSkillRecord(id)
      .then((row) => setSkill(row))
      .catch(() => setSkill(null));
    void Promise.all([loadFeedbackPanel(), loadVersionsPanel()]);
  }, [id, hasToken]);

  async function onSubmitHumanFeedback(): Promise<void> {
    const resolvedProblemType = (customProblemType.trim() || feedbackForm.problemType?.trim() || "").trim();
    if (!resolvedProblemType || !feedbackForm.freeText?.trim()) {
      setOpMsg("问题类型与问题描述为必填");
      return;
    }
    setSubmitFeedbackBusy(true);
    setOpMsg(null);
    try {
      await createSkillHumanFeedback(id, {
        role: feedbackForm.role,
        sentiment: feedbackForm.sentiment,
        problemType: resolvedProblemType,
        severity: feedbackForm.severity,
        freeText: feedbackForm.freeText.trim(),
        suggestion: feedbackForm.suggestion?.trim() || undefined,
        runId: feedbackForm.runId?.trim() || undefined,
      });
      setFeedbackForm((prev) => ({
        ...prev,
        problemType: problemTypeOptions[0] ?? "",
        freeText: "",
        suggestion: "",
        runId: "",
      }));
      setCustomProblemType("");
      await Promise.all([loadFeedbackPanel(), loadVersionsPanel()]);
      setOpMsg("人工反馈提交成功");
    } catch (e) {
      setOpMsg(e instanceof Error ? e.message : "人工反馈提交失败");
    } finally {
      setSubmitFeedbackBusy(false);
    }
  }

  async function onRegenerateFromFeedback(): Promise<void> {
    setRegenerateBusy(true);
    setOpMsg(null);
    try {
      await regenerateSkillFromFeedback(id, { limit: regenerateLimit ?? 10 });
      await Promise.all([loadFeedbackPanel(), loadVersionsPanel()]);
      setOpMsg("已触发基于反馈的再生成");
    } catch (e) {
      setOpMsg(e instanceof Error ? e.message : "再生成失败");
    } finally {
      setRegenerateBusy(false);
    }
  }

  if (!Number.isFinite(id) || id < 1) {
    return (
      <div className="ui-page">
        <p className="ui-hint">无效的 Skill id</p>
      </div>
    );
  }

  return (
    <div className="ui-page">
      <p className="ui-back">
        <Link to="/skills">Skill 库</Link> / <Link to={`/skills/${id}`}>详情</Link>
      </p>
      <h2 className="ui-page-title">
        Skill #{id} 人工反馈
        {skill ? ` · ${skill.skillId}` : ""}
      </h2>
      {opMsg ? <p className="ui-meta">{opMsg}</p> : null}

      <section className="ui-section">
        <h3>人工反馈</h3>
        {feedbackStatus.loading ? <p className="ui-meta">加载中…</p> : null}
        {feedbackStatus.error ? <p className="ui-error">{feedbackStatus.error}</p> : null}
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <label className="ui-meta">
            反馈角色
            <select
              className="ui-input"
              value={feedbackForm.role}
              onChange={(e) =>
                setFeedbackForm((prev) => ({ ...prev, role: e.target.value as HumanFeedbackCreateBody["role"] }))
              }
            >
              <option value="user">用户</option>
              <option value="reviewer">审核者</option>
              <option value="agent">智能体</option>
            </select>
          </label>
          <label className="ui-meta">
            反馈倾向
            <select
              className="ui-input"
              value={feedbackForm.sentiment}
              onChange={(e) =>
                setFeedbackForm((prev) => ({
                  ...prev,
                  sentiment: e.target.value as HumanFeedbackCreateBody["sentiment"],
                }))
              }
            >
              <option value="positive">正向</option>
              <option value="neutral">中性</option>
              <option value="negative">负向</option>
            </select>
          </label>
          <label className="ui-meta">
            严重程度
            <select
              className="ui-input"
              value={feedbackForm.severity}
              onChange={(e) =>
                setFeedbackForm((prev) => ({
                  ...prev,
                  severity: e.target.value as HumanFeedbackCreateBody["severity"],
                }))
              }
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </label>
          <label className="ui-meta">
            问题类型
            <select
              className="ui-input"
              value={feedbackForm.problemType}
              onChange={(e) => setFeedbackForm((prev) => ({ ...prev, problemType: e.target.value }))}
            >
              {problemTypeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <label className="ui-meta">
            自定义问题类型（可选，优先）
            <input
              className="ui-input"
              value={customProblemType}
              onChange={(e) => setCustomProblemType(e.target.value)}
              placeholder="例如 context_missing"
            />
          </label>
          <label className="ui-meta">
            问题描述
            <textarea
              className="ui-textarea"
              rows={4}
              value={feedbackForm.freeText}
              onChange={(e) => setFeedbackForm((prev) => ({ ...prev, freeText: e.target.value }))}
            />
          </label>
          <label className="ui-meta">
            改进建议（可选）
            <textarea
              className="ui-textarea"
              rows={2}
              value={feedbackForm.suggestion ?? ""}
              onChange={(e) => setFeedbackForm((prev) => ({ ...prev, suggestion: e.target.value }))}
            />
          </label>
          <label className="ui-meta">
            运行 ID（可选）
            <input
              className="ui-input"
              value={feedbackForm.runId ?? ""}
              onChange={(e) => setFeedbackForm((prev) => ({ ...prev, runId: e.target.value }))}
            />
          </label>
          <button className="ui-btn" type="button" disabled={submitFeedbackBusy} onClick={() => void onSubmitHumanFeedback()}>
            {submitFeedbackBusy ? "提交中…" : "提交人工反馈"}
          </button>
        </div>
        {humanFeedback.length === 0 ? (
          <p className="ui-hint">暂无人工反馈</p>
        ) : (
          <ul className="ui-run-list">
            {humanFeedback.map((f) => (
              <li key={f.id} className="ui-run-row">
                <div className="ui-meta">
                  {roleLabel(f.role)} · {sentimentLabel(f.sentiment)} · {f.problemType} · {severityLabel(f.severity)} · {f.createdAt}
                </div>
                <div className="ui-meta">{f.freeText}</div>
                {f.suggestion ? <div className="ui-meta">建议：{f.suggestion}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ui-section" style={{ marginTop: 16 }}>
        <h3>版本链</h3>
        {versionsStatus.loading ? <p className="ui-meta">加载中…</p> : null}
        {versionsStatus.error ? <p className="ui-error">{versionsStatus.error}</p> : null}
        <div className="ui-toolbar-inline" style={{ marginBottom: 8 }}>
          <label className="ui-meta">
            采样反馈条数
            <input
              className="ui-input"
              style={{ width: 120, marginLeft: 8 }}
              type="number"
              min={1}
              max={50}
              value={regenerateLimit ?? 10}
              onChange={(e) => setRegenerateLimit(Math.max(1, Math.min(50, Number(e.target.value) || 10)))}
            />
          </label>
          <button className="ui-btn" type="button" disabled={regenerateBusy} onClick={() => void onRegenerateFromFeedback()}>
            {regenerateBusy ? "生成中…" : "基于反馈再生成"}
          </button>
        </div>
        {versions.length === 0 ? (
          <p className="ui-hint">暂无版本链数据</p>
        ) : (
          <ul className="ui-run-list">
            {versions.map((v) => (
              <li key={v.id} className="ui-run-row">
                <div className="ui-meta">
                  #{v.id} · v{v.version} · 状态={v.status} · 父版本={v.parentSkillRecordId ?? "-"} · {v.createdAt}
                </div>
                {v.changeSummary ? <div className="ui-meta">{v.changeSummary}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
