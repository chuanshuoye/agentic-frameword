import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  apiBase,
  deleteSessions,
  distillSessions,
  fetchSessionProjects,
  fetchSessions,
  syncSessionsToRuns,
  syncSessions,
  type SessionDistillResult,
  type SessionProjectCandidate,
  type SessionProviderId,
  type SessionRow,
} from "../api.js";

export function SessionsPage() {
  const [q, setQ] = useState("");
  const [agentId, setAgentId] = useState("");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [sessionProvider, setSessionProvider] = useState<SessionProviderId>("cursor");
  const [projectName, setProjectName] = useState("");
  const [sessionProjects, setSessionProjects] = useState<SessionProjectCandidate[]>([]);
  const [sessionProjectDir, setSessionProjectDir] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [distillSourceFiles, setDistillSourceFiles] = useState("");
  const [distillOutputDir, setDistillOutputDir] = useState("");
  const [distillTitle, setDistillTitle] = useState("");
  const [distillAgentId, setDistillAgentId] = useState("distill-agent");
  const [distillProjectName, setDistillProjectName] = useState("");
  const [distilling, setDistilling] = useState(false);
  const [distillMsg, setDistillMsg] = useState<string | null>(null);
  const [distillResult, setDistillResult] = useState<SessionDistillResult | null>(null);
  const [syncToRunsRunId, setSyncToRunsRunId] = useState("");
  const [strategy, setStrategy] = useState<"map_reduce" | "refine" | "hierarchical">("map_reduce");
  const [factualityMode, setFactualityMode] = useState<"strict_extract_only" | "balanced">(
    "strict_extract_only",
  );
  const [chunkSizeTokens, setChunkSizeTokens] = useState(1000);
  const [chunkOverlapTokens, setChunkOverlapTokens] = useState(150);
  const [detailLevel, setDetailLevel] = useState(0.5);
  const [targetCompressionRatio, setTargetCompressionRatio] = useState(0.2);
  const [maxOutputTokens, setMaxOutputTokens] = useState(3000);
  const [maxBullets, setMaxBullets] = useState(12);
  const [temperature, setTemperature] = useState(0.2);
  const [parallelism, setParallelism] = useState(4);
  const [syncAfterWrite, setSyncAfterWrite] = useState(true);

  async function load() {
    try {
      const rows = await fetchSessions({ q: q.trim() || undefined, agentId: agentId.trim() || undefined });
      setSessions(rows);
      setSelectedIds(new Set());
      setErr(null);
    } catch {
      setErr(`无法连接 ${apiBase}`);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    void refreshSessionProjects(sessionProvider, projectName.trim(), true);
  }, [sessionProvider]);

  async function refreshSessionProjects(
    provider: SessionProviderId,
    name: string,
    resetSelection: boolean,
  ) {
    try {
      const rows = await fetchSessionProjects(provider, name || undefined);
      setSessionProjects(rows);
      if (resetSelection) {
        const firstWithTranscripts = rows.find((item) => item.hasTranscripts);
        setSessionProjectDir((firstWithTranscripts ?? rows[0])?.transcriptsDir ?? "");
        return;
      }
      setSessionProjectDir((prev) => {
        if (prev && rows.some((item) => item.transcriptsDir === prev)) {
          return prev;
        }
        const firstWithTranscripts = rows.find((item) => item.hasTranscripts);
        return (firstWithTranscripts ?? rows[0])?.transcriptsDir ?? "";
      });
    } catch {
      // ignore
    }
  }

  async function onSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const result = await syncSessions({
        provider: sessionProvider,
        projectName: projectName.trim() || undefined,
        transcriptsDir: sessionProjectDir.trim() || undefined,
      });
      setSyncMsg(
        `同步完成：扫描 ${result.scannedFiles}，新增 ${result.inserted}，更新 ${result.updated}，跳过 ${result.skipped}`,
      );
      await load();
    } catch (error) {
      setSyncMsg(error instanceof Error ? error.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  }

  async function onBatchDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setSyncMsg("请先选择要删除的会话");
      return;
    }
    const confirmed = window.confirm(`确认删除选中的 ${ids.length} 条会话吗？`);
    if (!confirmed) {
      return;
    }
    try {
      const result = await deleteSessions(ids);
      setSyncMsg(`删除完成：删除 ${result.deleted} 条，会话关联项目清理 ${result.cleanedProjects} 条`);
      await load();
    } catch (error) {
      setSyncMsg(error instanceof Error ? error.message : "删除失败");
    }
  }

  async function onSyncSelectedToRuns() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setSyncMsg("请先选择要同步的会话");
      return;
    }
    setSyncing(true);
    setSyncMsg(null);
    setSyncToRunsRunId("");
    try {
      const result = await syncSessionsToRuns(ids);
      setSyncToRunsRunId(result.runId);
      setSyncMsg(
        `同步到观测成功：会话 ${result.sessionsProcessed}，事件 ${result.eventsGenerated}，写入 ${result.inserted}，跳过 ${result.skipped}`,
      );
    } catch (error) {
      setSyncMsg(error instanceof Error ? error.message : "同步到观测失败");
    } finally {
      setSyncing(false);
    }
  }

  function copySelectedToDistillSourceFiles() {
    const selectedRows = sessions.filter((item) => selectedIds.has(item.id));
    if (selectedRows.length === 0) {
      setDistillMsg("请先选择会话后再复制到 sourceFiles");
      return;
    }
    const files = selectedRows
      .map((item) => item.sourceAgentId.trim())
      .filter((item) => item.length > 0)
      .map((agentId) => `${agentId}/${agentId}.jsonl`);
    if (files.length === 0) {
      setDistillMsg("选中会话没有可用的 agentId");
      return;
    }
    setDistillSourceFiles(Array.from(new Set(files)).join("\n"));
    setDistillMsg(`已按规范复制 ${files.length} 条到 sourceFiles`);
  }

  async function onDistill() {
    if (!sessionProjectDir.trim()) {
      setDistillMsg("请先选择 transcripts 目录");
      return;
    }
    const sourceFiles = distillSourceFiles
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    if (sourceFiles.length === 0) {
      setDistillMsg("请填写 sourceFiles（每行一个相对/绝对路径）");
      return;
    }
    setDistilling(true);
    setDistillMsg(null);
    setDistillResult(null);
    try {
      const result = await distillSessions({
        transcriptsDir: sessionProjectDir.trim(),
        sourceFiles,
        outputDir: distillOutputDir.trim() || undefined,
        title: distillTitle.trim() || undefined,
        projectName: distillProjectName.trim() || undefined,
        agentId: distillAgentId.trim() || undefined,
        syncAfterWrite,
        config: {
          strategy,
          factualityMode,
          chunkSizeTokens,
          chunkOverlapTokens,
          detailLevel,
          targetCompressionRatio,
          maxOutputTokens,
          maxBullets,
          maxSentencesPerBullet: 2,
          temperature,
          topP: 1,
          parallelism,
          maxRetries: 1,
          timeoutMs: 45000,
          budgetTokens: 200000,
          outputTemplate: {
            sections: ["goal", "decisions", "changes", "openIssues", "nextActions"],
          },
          qualityChecks: {
            minCoverageRatio: 0.7,
            maxDuplicateRatio: 0.2,
            maxLengthDeviationRatio: 0.35,
            requireSections: ["goal", "decisions", "changes", "openIssues", "nextActions"],
          },
        },
      });
      setDistillResult(result);
      setDistillMsg(`蒸馏完成：${result.sessionId}`);
      await load();
    } catch (error) {
      setDistillMsg(error instanceof Error ? error.message : "蒸馏失败");
    } finally {
      setDistilling(false);
    }
  }

  const allSelected = sessions.length > 0 && sessions.every((item) => selectedIds.has(item.id));
  const selectedCount = selectedIds.size;

  let distillFidelityClass = "ui-hint";
  if (distillResult) {
    distillFidelityClass = distillResult.fidelity.pass ? "ui-status-ok" : "ui-status-warn";
  }

  return (
    <div className="ui-page ui-stack">
      <div className="ui-card ui-card--pad-lg ui-stack">
        <div className="ui-toolbar-row" style={{ justifyContent: "space-between" }}>
          <h2 className="ui-page-title" style={{ margin: 0 }}>
            Agent会话
          </h2>
          <div className="ui-muted">
            当前会话 {sessions.length} · 已选 {selectedCount}
          </div>
        </div>
        <div className="ui-toolbar">
          <div className="ui-toolbar-row">
            <input
              className="ui-input ui-flex-1"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="关键词（标题/内容）"
            />
            <input
              className="ui-input ui-agent-input"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="agentId（可选）"
            />
            <button className="ui-btn" type="button" onClick={() => void load()}>
              搜索
            </button>
          </div>
          <div className="ui-toolbar-row ui-toolbar-row--end">
            <button className="ui-btn" type="button" onClick={() => void onSync()} disabled={syncing}>
              {syncing ? "同步中..." : "同步本地 transcripts"}
            </button>
            <button className="ui-btn" type="button" onClick={copySelectedToDistillSourceFiles} disabled={selectedCount === 0}>
              复制选中到蒸馏
            </button>
            <button className="ui-btn" type="button" onClick={() => void onSyncSelectedToRuns()} disabled={selectedCount === 0 || syncing}>
              同步选中到观测
            </button>
            <button
              className="ui-btn ui-btn--danger"
              type="button"
              onClick={() => void onBatchDelete()}
              disabled={selectedCount === 0}
            >
              删除选中（{selectedCount}）
            </button>
          </div>
        </div>
        {syncMsg ? <p className="ui-hint">{syncMsg}</p> : null}
        {syncToRunsRunId ? (
          <p className="ui-hint">
            观测 Run：<Link to={`/runs/${encodeURIComponent(syncToRunsRunId)}`}>{syncToRunsRunId}</Link>
          </p>
        ) : null}
      </div>

      <div className="ui-split">
        <div className="ui-card ui-stack--sm">
          <div className="ui-toolbar-row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <p className="ui-section-title" style={{ marginBottom: 0 }}>
              会话列表
            </p>
            <label className="ui-check">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedIds(new Set(sessions.map((item) => item.id)));
                  } else {
                    setSelectedIds(new Set());
                  }
                }}
              />
              全选
            </label>
          </div>
          {err ? <p className="ui-error">{err}</p> : null}
          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>选中</th>
                  <th>标题</th>
                  <th>agentId</th>
                  <th>tokens</th>
                  <th>更新时间</th>
                  <th>预览</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (checked) {
                              next.add(s.id);
                            } else {
                              next.delete(s.id);
                            }
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td style={{ maxWidth: 280 }}>
                      <Link to={`/sessions/${s.id}`}>{s.title || s.sessionId}</Link>
                    </td>
                    <td className="ui-mono-cell">{s.sourceAgentId}</td>
                    <td className="ui-mono-cell">{s.totalTokens.toLocaleString()}</td>
                    <td className="ui-muted" style={{ fontSize: "0.8125rem" }}>
                      {s.updatedAt}
                    </td>
                    <td className="ui-preview-cell">{s.previewExcerpt.slice(0, 120)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ui-card ui-stack">
          <div className="ui-stack--sm">
            <p className="ui-section-title">本地会话源与项目</p>
            <div className="ui-stack--sm">
              <label className="ui-toolbar-row" style={{ gap: 8, alignItems: "center" }}>
                <span className="ui-muted">Provider</span>
                <select
                  className="ui-select"
                  value={sessionProvider}
                  onChange={(e) => setSessionProvider(e.target.value as SessionProviderId)}
                >
                  <option value="cursor">Cursor</option>
                  <option value="claude">Claude Code</option>
                </select>
              </label>
              <input
                className="ui-input"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={
                  sessionProvider === "cursor"
                    ? "projectName（匹配 Cursor projects 目录名）"
                    : "projectName（匹配 Claude ~/.claude/projects 子目录）"
                }
              />
              <div className="ui-toolbar-row">
                <button
                  className="ui-btn"
                  type="button"
                  onClick={() => void refreshSessionProjects(sessionProvider, projectName.trim(), false)}
                >
                  查询 projects
                </button>
              </div>
              <select
                className="ui-select"
                value={sessionProjectDir}
                onChange={(e) => setSessionProjectDir(e.target.value)}
              >
                <option value="">未选择目录（将按 projectName / 环境变量解析）</option>
                {sessionProjects.map((item) => (
                  <option key={item.path} value={item.transcriptsDir}>
                    {item.name} {!item.hasTranscripts ? "(无 transcripts)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="ui-stack--sm">
            <p className="ui-section-title">蒸馏工作台</p>
            <div className="ui-stack--sm">
              <textarea
                className="ui-textarea ui-textarea--mono"
                value={distillSourceFiles}
                onChange={(e) => setDistillSourceFiles(e.target.value)}
                placeholder={"sourceFiles（每行一个）\n示例：\nagentA/123.jsonl\nagentA/456.jsonl"}
              />
              <input
                className="ui-input"
                value={distillTitle}
                onChange={(e) => setDistillTitle(e.target.value)}
                placeholder="蒸馏会话标题（可选）"
              />
              <input
                className="ui-input"
                value={distillProjectName}
                onChange={(e) => setDistillProjectName(e.target.value)}
                placeholder="projectName（可选）"
              />
              <input
                className="ui-input"
                value={distillAgentId}
                onChange={(e) => setDistillAgentId(e.target.value)}
                placeholder="agentId（默认 distill-agent）"
              />
              <input
                className="ui-input"
                value={distillOutputDir}
                onChange={(e) => setDistillOutputDir(e.target.value)}
                placeholder="outputDir（可选）"
              />
              <label className="ui-check">
                <input type="checkbox" checked={syncAfterWrite} onChange={(e) => setSyncAfterWrite(e.target.checked)} />
                写入后自动同步
              </label>
              <button className="ui-btn" type="button" onClick={() => void onDistill()} disabled={distilling}>
                {distilling ? "蒸馏中..." : "开始蒸馏"}
              </button>
              {distillMsg ? <p className="ui-hint">{distillMsg}</p> : null}
              {distillResult ? (
                <p className={distillFidelityClass}>
                  fidelity: pass={String(distillResult.fidelity.pass)} · compression=
                  {distillResult.fidelity.compressionRatio.toFixed(3)} · coverage=
                  {distillResult.fidelity.keywordCoverageRatio.toFixed(3)} · output=
                  <code>{distillResult.outputFilePath}</code>
                </p>
              ) : null}
            </div>
          </div>

          <details className="ui-details">
            <summary>高级蒸馏参数</summary>
            <div className="ui-details-body">
              <div className="ui-form-grid">
                <label>
                  策略
                  <select className="ui-select" value={strategy} onChange={(e) => setStrategy(e.target.value as typeof strategy)}>
                    <option value="map_reduce">map_reduce</option>
                    <option value="refine">refine</option>
                    <option value="hierarchical">hierarchical</option>
                  </select>
                </label>
                <label>
                  事实性模式
                  <select
                    className="ui-select"
                    value={factualityMode}
                    onChange={(e) => setFactualityMode(e.target.value as typeof factualityMode)}
                  >
                    <option value="strict_extract_only">strict_extract_only</option>
                    <option value="balanced">balanced</option>
                  </select>
                </label>
                <label>
                  chunkSizeTokens
                  <input
                    className="ui-input"
                    type="number"
                    value={chunkSizeTokens}
                    min={300}
                    max={4000}
                    onChange={(e) => setChunkSizeTokens(Number(e.target.value) || 1000)}
                  />
                </label>
                <label>
                  chunkOverlapTokens
                  <input
                    className="ui-input"
                    type="number"
                    value={chunkOverlapTokens}
                    min={0}
                    max={800}
                    onChange={(e) => setChunkOverlapTokens(Number(e.target.value) || 150)}
                  />
                </label>
                <label>
                  detailLevel ({detailLevel.toFixed(2)})
                  <input
                    type="range"
                    value={detailLevel}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(e) => setDetailLevel(Number(e.target.value))}
                  />
                </label>
                <label>
                  targetCompressionRatio ({targetCompressionRatio.toFixed(2)})
                  <input
                    type="range"
                    value={targetCompressionRatio}
                    min={0.05}
                    max={0.8}
                    step={0.01}
                    onChange={(e) => setTargetCompressionRatio(Number(e.target.value))}
                  />
                </label>
                <label>
                  maxOutputTokens
                  <input
                    className="ui-input"
                    type="number"
                    value={maxOutputTokens}
                    min={200}
                    max={16000}
                    onChange={(e) => setMaxOutputTokens(Number(e.target.value) || 3000)}
                  />
                </label>
                <label>
                  maxBullets
                  <input
                    className="ui-input"
                    type="number"
                    value={maxBullets}
                    min={3}
                    max={30}
                    onChange={(e) => setMaxBullets(Number(e.target.value) || 12)}
                  />
                </label>
                <label>
                  temperature
                  <input
                    className="ui-input"
                    type="number"
                    value={temperature}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                  />
                </label>
                <label>
                  parallelism
                  <input
                    className="ui-input"
                    type="number"
                    value={parallelism}
                    min={1}
                    max={12}
                    onChange={(e) => setParallelism(Number(e.target.value) || 4)}
                  />
                </label>
              </div>
              <pre className="ui-pre">
                {JSON.stringify(
                  {
                    strategy,
                    factualityMode,
                    chunkSizeTokens,
                    chunkOverlapTokens,
                    detailLevel,
                    targetCompressionRatio,
                    maxOutputTokens,
                    maxBullets,
                    temperature,
                    parallelism,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
