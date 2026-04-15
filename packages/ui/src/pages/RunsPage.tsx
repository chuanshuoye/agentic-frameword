import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiBase, fetchRuns, type RunRow } from "../api.js";

const REFRESH_INTERVAL_OPTIONS_MS = [5000, 30000, 60_000] as const;

function formatRefreshLabel(ms: number): string {
  if (ms === 5000) {
    return "5 秒";
  }
  if (ms === 30000) {
    return "30 秒";
  }
  if (ms === 60_000) {
    return "1 分钟";
  }
  return `${ms} ms`;
}

export function RunsPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshIntervalMs, setRefreshIntervalMs] =
    useState<(typeof REFRESH_INTERVAL_OPTIONS_MS)[number]>(5000);

  const loadRuns = useCallback(async (opts?: { skipIfCancelled?: () => boolean }) => {
    try {
      const r = await fetchRuns();
      if (opts?.skipIfCancelled?.()) {
        return;
      }
      setRuns(r);
      setErr(null);
    } catch {
      if (opts?.skipIfCancelled?.()) {
        return;
      }
      setErr(`无法连接 ${apiBase}`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const skipIfCancelled = () => cancelled;
    void loadRuns({ skipIfCancelled });
    if (!autoRefresh) {
      return () => {
        cancelled = true;
      };
    }
    const id = setInterval(() => void loadRuns({ skipIfCancelled }), refreshIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [autoRefresh, refreshIntervalMs, loadRuns]);

  async function onManualRefresh() {
    setRefreshing(true);
    try {
      await loadRuns();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="ui-page">
      <h2 className="ui-page-title">Agent回溯</h2>
      <div className="ui-toolbar-inline">
        <label className="ui-check">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          定时刷新
        </label>
        {autoRefresh ? (
          <label className="ui-check">
            <span>间隔</span>
            <select
              className="ui-select"
              value={refreshIntervalMs}
              onChange={(e) =>
                setRefreshIntervalMs(Number(e.target.value) as (typeof REFRESH_INTERVAL_OPTIONS_MS)[number])
              }
            >
              {REFRESH_INTERVAL_OPTIONS_MS.map((ms) => (
                <option key={ms} value={ms}>
                  {formatRefreshLabel(ms)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button className="ui-btn" type="button" onClick={() => void onManualRefresh()} disabled={refreshing}>
          {refreshing ? "查询中…" : "主动查询"}
        </button>
      </div>
      {err ? <p className="ui-error">{err}</p> : null}
      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead>
            <tr>
              <th>runId</th>
              <th>事件数</th>
              <th>最后事件</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.runId}>
                <td className="ui-mono-cell">
                  <Link to={`/runs/${encodeURIComponent(r.runId)}`}>{r.runId}</Link>
                </td>
                <td>{r.eventCount}</td>
                <td className="ui-muted" style={{ fontSize: "0.8125rem" }}>
                  {r.lastEventAt}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
