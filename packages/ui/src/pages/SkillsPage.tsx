import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiBase, fetchSkillRecords, type SkillRecordListItem } from "../api.js";

type SkillGroup = {
  skillId: string;
  format: SkillRecordListItem["format"];
  rows: SkillRecordListItem[];
};

function groupSkills(rows: SkillRecordListItem[]): SkillGroup[] {
  const map = new Map<string, SkillGroup>();
  for (const row of rows) {
    const key = `${row.skillId}::${row.format}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, { skillId: row.skillId, format: row.format, rows: [row] });
      continue;
    }
    current.rows.push(row);
  }
  for (const group of map.values()) {
    group.rows.sort((a, b) => {
      if (b.version !== a.version) {
        return b.version - a.version;
      }
      return b.id - a.id;
    });
  }
  return Array.from(map.values()).sort((a, b) => {
    const av = a.rows[0]?.version ?? 0;
    const bv = b.rows[0]?.version ?? 0;
    if (bv !== av) {
      return bv - av;
    }
    return (b.rows[0]?.id ?? 0) - (a.rows[0]?.id ?? 0);
  });
}

export function SkillsPage() {
  const [skills, setSkills] = useState<SkillRecordListItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const hasToken = Boolean(
    (import.meta.env.VITE_AGENTIC_SERVER_TOKEN as string | undefined)?.trim(),
  );

  const load = useCallback(async () => {
    if (!hasToken) {
      setErr("未配置 VITE_AGENTIC_SERVER_TOKEN，无法拉取 Skill 库（接口需 Bearer）");
      setSkills([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchSkillRecords({ limit: 100 });
      setSkills(rows);
      setErr(null);
    } catch {
      setErr(`无法连接 ${apiBase} 或鉴权失败`);
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [hasToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="ui-page">
      <p className="ui-back">
        <Link to="/">Runs</Link>
      </p>
      <h2 className="ui-page-title">Skill 库</h2>
      <p className="ui-meta">
        由 Run 详情页「生成 Skill」后点击「保存到 Skill 库」写入。列表与详情需 Bearer。
      </p>
      <div className="ui-toolbar-inline" style={{ marginBottom: 12 }}>
        <button className="ui-btn" type="button" disabled={loading || !hasToken} onClick={() => void load()}>
          {loading ? "加载中…" : "刷新"}
        </button>
      </div>
      {err ? <p className="ui-error">{err}</p> : null}
      {!loading && !err && skills.length === 0 ? (
        <p className="ui-hint">库中暂无记录。请先在某一 Run 中生成并保存 Skill。</p>
      ) : null}
      {groupSkills(skills).map((group) => {
        const latest = group.rows[0];
        return (
          <section key={`${group.skillId}-${group.format}`} className="ui-section" style={{ marginTop: 12 }}>
            <div
              className="ui-toolbar-inline"
              style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}
            >
              <div>
                <div style={{ fontWeight: 600, wordBreak: "break-all" }}>{group.skillId}</div>
                <div className="ui-meta">
                  {group.format} · 版本数 {group.rows.length}
                  {latest ? ` · 最新 v${latest.version}` : ""}
                </div>
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                  <th style={{ padding: "8px 4px" }}>版本</th>
                  <th style={{ padding: "8px 4px" }}>状态</th>
                  <th style={{ padding: "8px 4px" }}>runId</th>
                  <th style={{ padding: "8px 4px" }}>创建时间</th>
                  <th style={{ padding: "8px 4px" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "8px 4px" }}>v{row.version} (#{row.id})</td>
                    <td style={{ padding: "8px 4px" }}>{row.status}</td>
                    <td style={{ padding: "8px 4px", wordBreak: "break-all" }}>
                      {row.runId ? <Link to={`/runs/${encodeURIComponent(row.runId)}`}>{row.runId}</Link> : "-"}
                    </td>
                    <td style={{ padding: "8px 4px" }}>{row.createdAt}</td>
                    <td style={{ padding: "8px 4px" }}>
                      <div className="ui-toolbar-inline">
                        <Link to={`/skills/${row.id}`}>详情</Link>
                        <Link to={`/skills/${row.id}/feedback`}>人工反馈</Link>
                        <Link to={`/skills/${row.id}/govern`}>治理</Link>
                        <Link to={`/skills/${row.id}/evolve`}>演进优化</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
