import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  createSkillExperiment,
  createSkillRuntimeFeedback,
  fetchSkillExperiments,
  fetchSkillFeedbackTrend,
  fetchSkillScorecard,
  rollbackSkill,
  type ScorecardResponse,
  type SkillFeedbackTrendResponse,
} from "../api.js";

type TrendWindowDays = 7 | 30 | 90;
type PanelStatus = { loading: boolean; error: string | null };

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtNum(v: number, digits = 1): string {
  return Number.isFinite(v) ? v.toFixed(digits) : "0.0";
}

function metricLabel(key: "successRate" | "avgLatencyMs" | "avgTokenCost" | "humanTakeoverRate"): string {
  if (key === "successRate") return "成功率";
  if (key === "avgLatencyMs") return "平均时延(ms)";
  if (key === "avgTokenCost") return "平均 token 成本";
  return "人工接管率";
}

function metricValue(
  p: SkillFeedbackTrendResponse["points"][number],
  key: "successRate" | "avgLatencyMs" | "avgTokenCost" | "humanTakeoverRate",
): number {
  if (key === "successRate") return p.successRate;
  if (key === "avgLatencyMs") return p.avgLatencyMs;
  if (key === "avgTokenCost") return p.avgTokenCost;
  return p.humanTakeoverRate;
}

function TinyLineChart(props: {
  points: SkillFeedbackTrendResponse["points"];
  metric: "successRate" | "avgLatencyMs" | "avgTokenCost" | "humanTakeoverRate";
}) {
  const { points, metric } = props;
  if (points.length === 0) {
    return <p className="ui-hint">暂无趋势数据</p>;
  }
  const width = 320;
  const height = 100;
  const pad = 12;
  const values = points.map((p) => metricValue(p, metric));
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1e-6);
  const step = points.length === 1 ? 0 : (width - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * step;
    const y = pad + ((max - metricValue(p, metric)) / span) * (height - pad * 2);
    return { x, y };
  });
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="ui-meta" style={{ marginBottom: 4 }}>
        {metricLabel(metric)}
      </div>
      <svg width={width} height={height} role="img" aria-label={metricLabel(metric)}>
        {coords.length > 1 ? (
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
          />
        ) : null}
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={3} fill="currentColor" />
        ))}
      </svg>
    </div>
  );
}

export function SkillEvolvePage() {
  const { skillId: idParam } = useParams();
  const id = idParam ? Number(idParam) : NaN;
  const hasToken = Boolean((import.meta.env.VITE_AGENTIC_SERVER_TOKEN as string | undefined)?.trim());
  const [scorecard, setScorecard] = useState<ScorecardResponse | null>(null);
  const [experiments, setExperiments] = useState<Awaited<ReturnType<typeof fetchSkillExperiments>>>([]);
  const [trendPoints, setTrendPoints] = useState<SkillFeedbackTrendResponse["points"]>([]);
  const [trendWindow, setTrendWindow] = useState<TrendWindowDays>(7);
  const [status, setStatus] = useState<PanelStatus>({ loading: true, error: null });
  const [opBusy, setOpBusy] = useState(false);
  const [opMsg, setOpMsg] = useState<string | null>(null);

  async function loadAll(targetWindow: TrendWindowDays): Promise<void> {
    setStatus({ loading: true, error: null });
    try {
      const [sc, exp, trend] = await Promise.all([
        fetchSkillScorecard(id),
        fetchSkillExperiments(id),
        fetchSkillFeedbackTrend(id, targetWindow),
      ]);
      setScorecard(sc);
      setExperiments(exp);
      setTrendPoints(trend);
      setStatus({ loading: false, error: null });
    } catch {
      setScorecard(null);
      setExperiments([]);
      setTrendPoints([]);
      setStatus({ loading: false, error: "演进优化数据加载失败" });
    }
  }

  useEffect(() => {
    if (!Number.isFinite(id) || id < 1) {
      setStatus({ loading: false, error: "无效的 id" });
      return;
    }
    if (!hasToken) {
      setStatus({ loading: false, error: "未配置 VITE_AGENTIC_SERVER_TOKEN" });
      return;
    }
    void loadAll(trendWindow);
  }, [id, hasToken, trendWindow]);

  async function runOp(action: () => Promise<void>, okMsg: string): Promise<void> {
    setOpBusy(true);
    setOpMsg(null);
    try {
      await action();
      await loadAll(trendWindow);
      setOpMsg(okMsg);
    } catch (e) {
      setOpMsg(e instanceof Error ? e.message : "操作失败");
    } finally {
      setOpBusy(false);
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
      <h2 className="ui-page-title">Skill #{id} 演进优化</h2>
      {opMsg ? <p className="ui-meta">{opMsg}</p> : null}
      <section className="ui-section">
        <h3>演进优化面板</h3>
        {status.loading ? <p className="ui-meta">加载中…</p> : null}
        {status.error ? <p className="ui-error">{status.error}</p> : null}
        {scorecard ? (
          <>
            <div className="ui-toolbar-inline" style={{ marginBottom: 12 }}>
              <span className="ui-meta">总样本: {scorecard.totalRuns}</span>
              <span className="ui-meta">成功率: {fmtPct(scorecard.successRate)}</span>
              <span className="ui-meta">平均时延: {fmtNum(scorecard.avgLatencyMs)}ms</span>
              <span className="ui-meta">p95: {fmtNum(scorecard.p95LatencyMs)}ms</span>
              <span className="ui-meta">平均 token 成本: {fmtNum(scorecard.avgTokenCost, 4)}</span>
              <span className="ui-meta">人工接管率: {fmtPct(scorecard.humanTakeoverRate)}</span>
            </div>
            <div className="ui-toolbar-inline" style={{ marginBottom: 12 }}>
              <button
                className="ui-btn"
                type="button"
                disabled={opBusy}
                onClick={() =>
                  void runOp(
                    async () => {
                      await createSkillRuntimeFeedback({
                        skillRecordId: id,
                        taskType: "manual_test",
                        success: true,
                        latencyMs: 850,
                        tokenCost: 0.01,
                        retryCount: 0,
                        humanTakeover: false,
                      });
                    },
                    "反馈写入成功",
                  )
                }
              >
                写入反馈
              </button>
              <button
                className="ui-btn"
                type="button"
                disabled={opBusy}
                onClick={() =>
                  void runOp(
                    async () => {
                      await createSkillExperiment(id, {
                        controlSkillRecordId: id,
                        candidateSkillRecordId: id,
                        trafficRatio: 0.1,
                        status: "draft",
                      });
                    },
                    "实验创建成功",
                  )
                }
              >
                创建实验
              </button>
              <button
                className="ui-btn"
                type="button"
                disabled={opBusy}
                onClick={() =>
                  void runOp(
                    async () => {
                      await rollbackSkill(id, { mode: "manual", operator: "system", reason: "manual rollback" });
                    },
                    "回滚已执行",
                  )
                }
              >
                执行回滚
              </button>
            </div>
            <div className="ui-toolbar-inline" style={{ marginBottom: 8 }}>
              <span className="ui-meta">趋势窗口</span>
              <button className="ui-btn" type="button" disabled={opBusy} onClick={() => setTrendWindow(7)}>
                7d
              </button>
              <button className="ui-btn" type="button" disabled={opBusy} onClick={() => setTrendWindow(30)}>
                30d
              </button>
              <button className="ui-btn" type="button" disabled={opBusy} onClick={() => setTrendWindow(90)}>
                90d
              </button>
            </div>
            <TinyLineChart points={trendPoints} metric="successRate" />
            <TinyLineChart points={trendPoints} metric="avgLatencyMs" />
            <TinyLineChart points={trendPoints} metric="avgTokenCost" />
            <TinyLineChart points={trendPoints} metric="humanTakeoverRate" />
            <details>
              <summary>实验列表</summary>
              {experiments.length === 0 ? (
                <p className="ui-hint">暂无实验</p>
              ) : (
                <ul className="ui-run-list">
                  {experiments.map((exp) => (
                    <li key={exp.id} className="ui-run-row">
                      <div className="ui-meta">
                        #{exp.id} · {exp.status} · 流量比例={fmtNum(exp.trafficRatio, 2)} · {exp.createdAt}
                      </div>
                      <div className="ui-meta">
                        对照版本={exp.controlSkillRecordId}, 实验版本={exp.candidateSkillRecordId}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </>
        ) : null}
      </section>
    </div>
  );
}
