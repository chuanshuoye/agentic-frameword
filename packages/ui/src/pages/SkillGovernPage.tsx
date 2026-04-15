import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchSkillGovernance,
  fetchSkillRecord,
  releaseSkill,
  reviewSkill,
  type GovernanceDetailResponse,
  type SkillRecordDetail,
} from "../api.js";

type PanelStatus = { loading: boolean; error: string | null };

export function SkillGovernPage() {
  const { skillId: idParam } = useParams();
  const id = idParam ? Number(idParam) : NaN;
  const hasToken = Boolean((import.meta.env.VITE_AGENTIC_SERVER_TOKEN as string | undefined)?.trim());
  const [skill, setSkill] = useState<SkillRecordDetail | null>(null);
  const [governance, setGovernance] = useState<GovernanceDetailResponse | null>(null);
  const [baseStatus, setBaseStatus] = useState<PanelStatus>({ loading: true, error: null });
  const [governStatus, setGovernStatus] = useState<PanelStatus>({ loading: true, error: null });
  const [opBusy, setOpBusy] = useState(false);
  const [opMsg, setOpMsg] = useState<string | null>(null);

  const canRelease = useMemo(() => {
    if (!skill || !governance) {
      return false;
    }
    if (skill.status !== "accepted") {
      return false;
    }
    return governance.gateDecision !== "deny";
  }, [skill, governance]);

  async function loadAll(): Promise<void> {
    setBaseStatus({ loading: true, error: null });
    setGovernStatus({ loading: true, error: null });
    try {
      const row = await fetchSkillRecord(id);
      setSkill(row);
      setBaseStatus({ loading: false, error: null });
    } catch {
      setSkill(null);
      setBaseStatus({ loading: false, error: "基础信息加载失败" });
    }
    try {
      const row = await fetchSkillGovernance(id);
      setGovernance(row);
      setGovernStatus({ loading: false, error: null });
    } catch {
      setGovernance(null);
      setGovernStatus({ loading: false, error: "治理数据加载失败" });
    }
  }

  useEffect(() => {
    if (!Number.isFinite(id) || id < 1) {
      setBaseStatus({ loading: false, error: "无效的 id" });
      setGovernStatus({ loading: false, error: null });
      return;
    }
    if (!hasToken) {
      setBaseStatus({ loading: false, error: "未配置 VITE_AGENTIC_SERVER_TOKEN" });
      setGovernStatus({ loading: false, error: null });
      return;
    }
    void loadAll();
  }, [id, hasToken]);

  async function runOp(action: () => Promise<void>, okMsg: string): Promise<void> {
    setOpBusy(true);
    setOpMsg(null);
    try {
      await action();
      await loadAll();
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
      <h2 className="ui-page-title">Skill #{id} 治理</h2>
      {opMsg ? <p className="ui-meta">{opMsg}</p> : null}

      <section className="ui-section">
        <h3>治理面板</h3>
        {baseStatus.loading || governStatus.loading ? <p className="ui-meta">加载中…</p> : null}
        {baseStatus.error ? <p className="ui-error">{baseStatus.error}</p> : null}
        {governStatus.error ? <p className="ui-error">{governStatus.error}</p> : null}
        {governance ? (
          <>
            <div className="ui-toolbar-inline" style={{ marginBottom: 10 }}>
              <span className="ui-meta">门禁结论: {governance.gateDecision}</span>
              <span className="ui-meta">命中数: {governance.hits.length}</span>
              <span className="ui-meta">审核数: {governance.reviews.length}</span>
              <span className="ui-meta">发布数: {governance.releases.length}</span>
            </div>
            <div className="ui-toolbar-inline" style={{ marginBottom: 12 }}>
              <button
                className="ui-btn"
                type="button"
                disabled={opBusy}
                onClick={() =>
                  void runOp(
                    async () => {
                      await reviewSkill(id, { reviewer: "system", decision: "approved" });
                    },
                    "审批通过",
                  )
                }
              >
                审批通过
              </button>
              <button
                className="ui-btn"
                type="button"
                disabled={opBusy}
                onClick={() =>
                  void runOp(
                    async () => {
                      await reviewSkill(id, { reviewer: "system", decision: "rejected", reason: "manual reject" });
                    },
                    "审批驳回",
                  )
                }
              >
                审批驳回
              </button>
              <button
                className="ui-btn"
                type="button"
                disabled={opBusy || !canRelease}
                onClick={() =>
                  void runOp(
                    async () => {
                      await releaseSkill(id, { channel: "default", approvedBy: "system" });
                    },
                    "发布成功",
                  )
                }
              >
                发布
              </button>
            </div>
            <details open>
              <summary>规则命中</summary>
              {governance.hits.length === 0 ? (
                <p className="ui-hint">暂无命中</p>
              ) : (
                <ul className="ui-run-list">
                  {governance.hits.map((h) => (
                    <li key={h.id} className="ui-run-row">
                      <div className="ui-meta">
                        [{h.severity}] {h.ruleName} · {h.decision} · {h.createdAt}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </details>
            <details>
              <summary>审核历史</summary>
              {governance.reviews.length === 0 ? (
                <p className="ui-hint">暂无审核记录</p>
              ) : (
                <ul className="ui-run-list">
                  {governance.reviews.map((r) => (
                    <li key={r.id} className="ui-run-row">
                      <div className="ui-meta">
                        {r.reviewer} · {r.decision} · {r.createdAt}
                      </div>
                      {r.reason ? <div className="ui-meta">{r.reason}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </details>
            <details>
              <summary>发布历史</summary>
              {governance.releases.length === 0 ? (
                <p className="ui-hint">暂无发布记录</p>
              ) : (
                <ul className="ui-run-list">
                  {governance.releases.map((r) => (
                    <li key={r.id} className="ui-run-row">
                      <div className="ui-meta">
                        {r.channel} · {r.status} · {r.approvedBy} · {r.createdAt}
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
