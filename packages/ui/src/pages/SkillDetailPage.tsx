import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiBase, fetchSkillRecord, type SkillRecordDetail } from "../api.js";

type SkillFileNode = {
  name: string;
  fullPath: string;
  isFile: boolean;
  children: SkillFileNode[];
};

function buildSkillFileTree(paths: string[]): SkillFileNode[] {
  const root: SkillFileNode[] = [];

  for (const rawPath of paths) {
    const parts = rawPath.split("/").filter(Boolean);
    if (parts.length === 0) {
      continue;
    }
    let current = root;
    let currentPath = "";
    for (let i = 0; i < parts.length; i += 1) {
      const name = parts[i];
      currentPath = currentPath ? `${currentPath}/${name}` : name;
      const isFile = i === parts.length - 1;
      const existing = current.find((item) => item.name === name && item.isFile === isFile);
      if (existing) {
        current = existing.children;
      } else {
        const node: SkillFileNode = {
          name,
          fullPath: currentPath,
          isFile,
          children: [],
        };
        current.push(node);
        current = node.children;
      }
    }
  }

  return sortNodes(root);
}

function sortNodes(nodes: SkillFileNode[]): SkillFileNode[] {
  const sorted = nodes.sort((a, b) => {
    if (a.isFile !== b.isFile) {
      return a.isFile ? 1 : -1;
    }
    return a.name.localeCompare(b.name);
  });
  for (const node of sorted) {
    if (!node.isFile && node.children.length > 0) {
      node.children = sortNodes(node.children);
    }
  }
  return sorted;
}

function renderSkillTreeNodes(
  nodes: SkillFileNode[],
  selectedPath: string | null,
  onSelect: (path: string) => void,
): JSX.Element {
  return (
    <ul className="skill-file-tree-list">
      {nodes.map((node) => {
        if (node.isFile) {
          const selectedClass = selectedPath === node.fullPath ? " skill-file-item-selected" : "";
          return (
            <li key={node.fullPath}>
              <button
                type="button"
                className={`skill-file-item skill-file-item-file${selectedClass}`}
                onClick={() => onSelect(node.fullPath)}
              >
                {node.name}
              </button>
            </li>
          );
        }
        return (
          <li key={node.fullPath}>
            <details className="skill-file-folder" open>
              <summary>{node.name}</summary>
              {renderSkillTreeNodes(node.children, selectedPath, onSelect)}
            </details>
          </li>
        );
      })}
    </ul>
  );
}

export function SkillDetailPage() {
  const { skillId: idParam } = useParams();
  const id = idParam ? Number(idParam) : NaN;
  const hasToken = Boolean((import.meta.env.VITE_AGENTIC_SERVER_TOKEN as string | undefined)?.trim());
  const [skill, setSkill] = useState<SkillRecordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id) || id < 1) {
      setError("无效的 Skill id");
      setLoading(false);
      return;
    }
    if (!hasToken) {
      setError("未配置 VITE_AGENTIC_SERVER_TOKEN");
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchSkillRecord(id)
      .then((row) => {
        setSkill(row);
        setError(null);
        setSelectedFilePath(row.files[0]?.path ?? null);
      })
      .catch(() => {
        setSkill(null);
        setError(`基础信息加载失败（${apiBase}）`);
        setSelectedFilePath(null);
      })
      .finally(() => setLoading(false));
  }, [id, hasToken]);

  const fileTree = useMemo(() => {
    if (!skill?.files?.length) {
      return [];
    }
    return buildSkillFileTree(skill.files.map((item) => item.path));
  }, [skill]);

  const selectedFile = useMemo(() => {
    if (!skill?.files?.length) {
      return null;
    }
    if (!selectedFilePath) {
      return skill.files[0] ?? null;
    }
    return skill.files.find((item) => item.path === selectedFilePath) ?? skill.files[0] ?? null;
  }, [skill, selectedFilePath]);

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
        <Link to="/skills">Skill 库</Link>
      </p>
      <h2 className="ui-page-title">Skill #{id} 详情</h2>
      <div className="ui-toolbar-inline" style={{ marginBottom: 10 }}>
        <Link to={`/skills/${id}/feedback`}>进入人工反馈</Link>
        <Link to={`/skills/${id}/govern`}>进入治理</Link>
        <Link to={`/skills/${id}/evolve`}>进入演进优化</Link>
      </div>

      <section className="ui-section">
        <h3>基础信息</h3>
        {loading ? <p className="ui-meta">加载中…</p> : null}
        {error ? <p className="ui-error">{error}</p> : null}
        {skill ? (
          <dl className="ui-meta" style={{ display: "grid", gap: 6 }}>
            <dt>格式</dt>
            <dd style={{ margin: 0 }}>{skill.format}</dd>
            <dt>技能 ID</dt>
            <dd style={{ margin: 0, wordBreak: "break-all" }}>{skill.skillId}</dd>
            <dt>版本</dt>
            <dd style={{ margin: 0 }}>v{skill.version}</dd>
            <dt>状态</dt>
            <dd style={{ margin: 0 }}>{skill.status}</dd>
            <dt>创建时间</dt>
            <dd style={{ margin: 0 }}>{skill.createdAt}</dd>
            {skill.runId ? (
              <>
                <dt>运行 ID</dt>
                <dd style={{ margin: 0, wordBreak: "break-all" }}>
                  <Link to={`/runs/${encodeURIComponent(skill.runId)}`}>{skill.runId}</Link>
                </dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </section>

      {skill?.files?.length ? (
        <section className="ui-section" style={{ marginTop: 16 }}>
          <h3>文件</h3>
          <div className="skill-file-browser">
            <aside className="skill-file-sidebar">
              {renderSkillTreeNodes(fileTree, selectedFile?.path ?? null, setSelectedFilePath)}
            </aside>
            <div className="skill-file-content">
              {selectedFile ? (
                <>
                  <div className="ui-meta">
                    <code>{selectedFile.path}</code>
                  </div>
                  <pre className="ui-pre ui-pre--json ui-pre--json-open">{selectedFile.content}</pre>
                </>
              ) : (
                <p className="ui-hint">暂无可展示文件</p>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
