import type Database from "better-sqlite3";
import type {
  AgenticEvent,
  GovernanceDetailResponse,
  HumanFeedbackCreateBody,
  HumanFeedbackItem,
  PolicyDecision,
  RegenerateFromFeedbackBody,
  RunRow,
  SessionDetail,
  SessionRow,
  SkillEvalRunCreateBody,
  SkillExperimentCreateBody,
  SkillRollbackBody,
  SkillRuntimeFeedbackCreateBody,
  SkillVersionItem,
  SkillBundle,
  SkillGenerationMeta,
  SkillRecordDetail,
  SkillRecordListItem,
  SkillRecordStatus,
  StoredEvent,
} from "@agentic/shared";
import { normalizeBundlesToFiles } from "./skill/fileTree.js";

export type { StoredEvent, SessionRow, SessionDetail } from "@agentic/shared";

export type SessionSourceType = "cursor_local" | "claude_local";

export type ProjectRecord = {
  projectKey: string;
  projectName: string;
  projectPath: string;
};

export type SessionUpsertInput = {
  projectKey: string;
  sourceType: SessionSourceType;
  sourceAgentId: string;
  sessionId: string;
  title: string;
  timeStart: string;
  timeEnd: string;
  previewExcerpt: string;
  rawRef: string;
  contentText: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export function ingestEvents(db: Database.Database, events: AgenticEvent[]): {
  inserted: number;
  skipped: number;
} {
  const upsertRun = db.prepare(`
    INSERT INTO runs (run_id, created_at, last_event_at)
    VALUES (@run_id, @created_at, @last_event_at)
    ON CONFLICT(run_id) DO UPDATE SET
      last_event_at = excluded.last_event_at
  `);
  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO events (run_id, agent_id, seq, provider, kind, ts, payload_json)
    VALUES (@run_id, @agent_id, @seq, @provider, @kind, @ts, @payload_json)
  `);

  let inserted = 0;
  let skipped = 0;

  const tx = db.transaction((batch: AgenticEvent[]) => {
    for (const e of batch) {
      upsertRun.run({
        run_id: e.runId,
        created_at: e.ts,
        last_event_at: e.ts,
      });
      const info = insertEvent.run({
        run_id: e.runId,
        agent_id: e.agentId,
        seq: e.seq,
        provider: e.provider,
        kind: e.kind,
        ts: e.ts,
        payload_json: JSON.stringify(e.payload),
      });
      if (info.changes > 0) {
        inserted += 1;
      } else {
        skipped += 1;
      }
    }
  });

  tx(events);
  return { inserted, skipped };
}

export function listRuns(db: Database.Database, limit: number): RunRow[] {
  const rows = db
    .prepare(
      `
    SELECT r.run_id AS runId, r.created_at AS createdAt, r.last_event_at AS lastEventAt,
           COUNT(e.id) AS eventCount
    FROM runs r
    LEFT JOIN events e ON e.run_id = r.run_id
    GROUP BY r.run_id
    ORDER BY r.last_event_at DESC
    LIMIT ?
  `,
    )
    .all(limit) as RunRow[];
  return rows;
}

export function getRun(
  db: Database.Database,
  runId: string,
): { runId: string; createdAt: string; lastEventAt: string } | null {
  const row = db
    .prepare(
      `SELECT run_id AS runId, created_at AS createdAt, last_event_at AS lastEventAt FROM runs WHERE run_id = ?`,
    )
    .get(runId) as
    | { runId: string; createdAt: string; lastEventAt: string }
    | undefined;
  return row ?? null;
}

export function listEvents(
  db: Database.Database,
  runId: string,
  opts: { sinceSeq?: number; agentId?: string },
): StoredEvent[] {
  const sinceSeq = opts.sinceSeq ?? -1;
  const agentId = opts.agentId;

  if (agentId) {
    const rows = db
      .prepare(
        `
      SELECT id, run_id AS runId, agent_id AS agentId, seq, provider, kind, ts, payload_json AS payloadJson
      FROM events
      WHERE run_id = ? AND seq > ? AND agent_id = ?
      ORDER BY seq ASC
    `,
      )
      .all(runId, sinceSeq, agentId) as Array<{
        id: number;
        runId: string;
        agentId: string;
        seq: number;
        provider: string;
        kind: string;
        ts: string;
        payloadJson: string;
      }>;
    return rows.map(parseRow);
  }

  const rows = db
    .prepare(
      `
    SELECT id, run_id AS runId, agent_id AS agentId, seq, provider, kind, ts, payload_json AS payloadJson
    FROM events
    WHERE run_id = ? AND seq > ?
    ORDER BY seq ASC
  `,
    )
    .all(runId, sinceSeq) as Array<{
      id: number;
      runId: string;
      agentId: string;
      seq: number;
      provider: string;
      kind: string;
      ts: string;
      payloadJson: string;
    }>;
  return rows.map(parseRow);
}

function parseRow(row: {
  id: number;
  runId: string;
  agentId: string;
  seq: number;
  provider: string;
  kind: string;
  ts: string;
  payloadJson: string;
}): StoredEvent {
  const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
  return {
    id: row.id,
    runId: row.runId,
    agentId: row.agentId,
    seq: row.seq,
    provider: row.provider,
    kind: row.kind as AgenticEvent["kind"],
    ts: row.ts,
    payload,
  };
}

export function upsertProject(db: Database.Database, project: ProjectRecord): void {
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO projects (project_key, project_name, project_path, created_at, updated_at)
    VALUES (@project_key, @project_name, @project_path, @created_at, @updated_at)
    ON CONFLICT(project_key) DO UPDATE SET
      project_name = excluded.project_name,
      project_path = excluded.project_path,
      updated_at = excluded.updated_at
  `,
  ).run({
    project_key: project.projectKey,
    project_name: project.projectName,
    project_path: project.projectPath,
    created_at: now,
    updated_at: now,
  });
}

export function upsertSessions(
  db: Database.Database,
  sessions: SessionUpsertInput[],
): { inserted: number; updated: number } {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `
    INSERT INTO session_index (
      project_key, source_type, source_agent_id, session_id, title, time_start, time_end,
      preview_excerpt, raw_ref, content_text, input_tokens, output_tokens, total_tokens, created_at, updated_at
    )
    VALUES (
      @project_key, @source_type, @source_agent_id, @session_id, @title, @time_start, @time_end,
      @preview_excerpt, @raw_ref, @content_text, @input_tokens, @output_tokens, @total_tokens, @created_at, @updated_at
    )
    ON CONFLICT(project_key, source_type, source_agent_id, session_id) DO UPDATE SET
      title = excluded.title,
      time_start = excluded.time_start,
      time_end = excluded.time_end,
      preview_excerpt = excluded.preview_excerpt,
      raw_ref = excluded.raw_ref,
      content_text = excluded.content_text,
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens,
      total_tokens = excluded.total_tokens,
      updated_at = excluded.updated_at
  `,
  );
  const existingStmt = db.prepare(
    `
    SELECT id FROM session_index
    WHERE project_key = ? AND source_type = ? AND source_agent_id = ? AND session_id = ?
  `,
  );
  let inserted = 0;
  let updated = 0;
  const tx = db.transaction((rows: SessionUpsertInput[]) => {
    for (const row of rows) {
      const before = existingStmt.get(
        row.projectKey,
        row.sourceType,
        row.sourceAgentId,
        row.sessionId,
      ) as { id: number } | undefined;
      stmt.run({
        project_key: row.projectKey,
        source_type: row.sourceType,
        source_agent_id: row.sourceAgentId,
        session_id: row.sessionId,
        title: row.title,
        time_start: row.timeStart,
        time_end: row.timeEnd,
        preview_excerpt: row.previewExcerpt,
        raw_ref: row.rawRef,
        content_text: row.contentText,
        input_tokens: row.inputTokens,
        output_tokens: row.outputTokens,
        total_tokens: row.totalTokens,
        created_at: now,
        updated_at: now,
      });
      if (before) {
        updated += 1;
      } else {
        inserted += 1;
      }
    }
  });
  tx(sessions);
  return { inserted, updated };
}

export function searchSessions(
  db: Database.Database,
  params: { projectKey?: string; agentId?: string; query?: string; limit: number; offset: number },
): SessionRow[] {
  const clauses = ["1=1"];
  const values: Array<string | number> = [];
  if (params.projectKey) {
    clauses.push("s.project_key = ?");
    values.push(params.projectKey);
  }
  if (params.agentId) {
    clauses.push("s.source_agent_id = ?");
    values.push(params.agentId);
  }
  if (params.query) {
    clauses.push("(s.title LIKE ? OR s.preview_excerpt LIKE ? OR s.content_text LIKE ?)");
    const pattern = `%${params.query}%`;
    values.push(pattern, pattern, pattern);
  }
  values.push(params.limit, params.offset);
  const rows = db
    .prepare(
      `
      SELECT
        s.id AS id,
        s.project_key AS projectKey,
        s.source_type AS sourceType,
        s.source_agent_id AS sourceAgentId,
        s.session_id AS sessionId,
        s.title AS title,
        s.time_start AS timeStart,
        s.time_end AS timeEnd,
        s.preview_excerpt AS previewExcerpt,
        s.raw_ref AS rawRef,
        s.input_tokens AS inputTokens,
        s.output_tokens AS outputTokens,
        s.total_tokens AS totalTokens,
        s.updated_at AS updatedAt
      FROM session_index s
      WHERE ${clauses.join(" AND ")}
      ORDER BY s.updated_at DESC
      LIMIT ? OFFSET ?
    `,
    )
    .all(...values) as SessionRow[];
  return rows;
}

export function getSessionDetail(db: Database.Database, id: number): SessionDetail | null {
  const row = db
    .prepare(
      `
      SELECT
        s.id AS id,
        s.project_key AS projectKey,
        s.source_type AS sourceType,
        s.source_agent_id AS sourceAgentId,
        s.session_id AS sessionId,
        s.title AS title,
        s.time_start AS timeStart,
        s.time_end AS timeEnd,
        s.preview_excerpt AS previewExcerpt,
        s.raw_ref AS rawRef,
        s.input_tokens AS inputTokens,
        s.output_tokens AS outputTokens,
        s.total_tokens AS totalTokens,
        s.content_text AS contentText,
        s.updated_at AS updatedAt,
        p.project_name AS projectName,
        p.project_path AS projectPath
      FROM session_index s
      JOIN projects p ON p.project_key = s.project_key
      WHERE s.id = ?
    `,
    )
    .get(id) as SessionDetail | undefined;
  return row ?? null;
}

export function deleteSessionsByIds(
  db: Database.Database,
  ids: number[],
): { deleted: number; cleanedProjects: number } {
  if (ids.length === 0) {
    return { deleted: 0, cleanedProjects: 0 };
  }
  const placeholders = ids.map(() => "?").join(", ");
  const deleteStmt = db.prepare(
    `DELETE FROM session_index WHERE id IN (${placeholders})`,
  );
  const cleanupStmt = db.prepare(`
    DELETE FROM projects
    WHERE project_key NOT IN (SELECT DISTINCT project_key FROM session_index)
  `);
  const tx = db.transaction((input: number[]) => {
    const deleted = deleteStmt.run(...input).changes;
    const cleanedProjects = cleanupStmt.run().changes;
    return { deleted, cleanedProjects };
  });
  return tx(ids);
}

export function saveSkillBundlesAsRecords(
  db: Database.Database,
  params: {
    runId?: string;
    bundles: SkillBundle[];
    generationMeta?: SkillGenerationMeta;
  },
): { ids: number[]; jobId: number } {
  const normalized = normalizeBundlesToFiles(params.bundles);
  const now = new Date().toISOString();
  const jobPayload = JSON.stringify({
    runId: params.runId ?? null,
    bundleCount: normalized.bundles.length,
  });
  const metaJson = params.generationMeta ? JSON.stringify(params.generationMeta) : null;

  const insertJob = db.prepare(`
    INSERT INTO async_jobs (type, payload_json, status, result_ref, error, created_at, updated_at)
    VALUES ('skill_save', @payload_json, 'pending', NULL, NULL, @created_at, @updated_at)
  `);
  const updateJob = db.prepare(`
    UPDATE async_jobs
    SET status = @status, result_ref = @result_ref, error = @error, updated_at = @updated_at
    WHERE id = @id
  `);
  const insertSkill = db.prepare(`
    INSERT INTO skill_records (run_id, format, skill_id, status, files_json, meta_json, created_at)
    VALUES (@run_id, @format, @skill_id, 'review_required', @files_json, @meta_json, @created_at)
  `);

  const tx = db.transaction(() => {
    const jobRun = insertJob.run({
      payload_json: jobPayload,
      created_at: now,
      updated_at: now,
    });
    const jobId = Number(jobRun.lastInsertRowid);
    updateJob.run({
      id: jobId,
      status: "running",
      result_ref: null,
      error: null,
      updated_at: now,
    });
    const ids: number[] = [];
    for (const b of normalized.bundles) {
      const r = insertSkill.run({
        run_id: params.runId ?? null,
        format: b.format,
        skill_id: b.skillId,
        files_json: JSON.stringify(b.files),
        meta_json: metaJson,
        created_at: now,
      });
      ids.push(Number(r.lastInsertRowid));
    }
    const doneAt = new Date().toISOString();
    updateJob.run({
      id: jobId,
      status: "completed",
      result_ref: JSON.stringify({ skillRecordIds: ids }),
      error: null,
      updated_at: doneAt,
    });
    return { ids, jobId };
  });

  return tx();
}

export function listSkillRecords(
  db: Database.Database,
  opts: { limit: number; runId?: string; format?: string },
): SkillRecordListItem[] {
  const limit = Math.min(Math.max(opts.limit, 1), 200);
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (opts.runId) {
    clauses.push("run_id = ?");
    values.push(opts.runId);
  }
  if (opts.format) {
    clauses.push("format = ?");
    values.push(opts.format);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  values.push(limit);
  const rows = db
    .prepare(
      `
    SELECT
      id AS id,
      run_id AS runId,
      format AS format,
      skill_id AS skillId,
      COALESCE(version, 1) AS version,
      status AS status,
      created_at AS createdAt
    FROM skill_records
    ${where}
    ORDER BY id DESC
    LIMIT ?
  `,
    )
    .all(...values) as Array<{
    id: number;
    runId: string | null;
    format: string;
    skillId: string;
    version: number;
    status: string;
    createdAt: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    runId: r.runId,
    format: r.format as SkillRecordListItem["format"],
    skillId: r.skillId,
    version: r.version,
    status: r.status as SkillRecordListItem["status"],
    createdAt: r.createdAt,
  }));
}

export function getSkillRecord(db: Database.Database, id: number): SkillRecordDetail | null {
  const row = db
    .prepare(
      `
    SELECT
      id AS id,
      run_id AS runId,
      format AS format,
      skill_id AS skillId,
      COALESCE(version, 1) AS version,
      status AS status,
      files_json AS filesJson,
      meta_json AS metaJson,
      created_at AS createdAt
    FROM skill_records
    WHERE id = ?
  `,
    )
    .get(id) as
    | {
        id: number;
        runId: string | null;
        format: string;
        skillId: string;
        version: number;
        status: string;
        filesJson: string;
        metaJson: string | null;
        createdAt: string;
      }
    | undefined;
  if (!row) {
    return null;
  }
  let files: SkillRecordDetail["files"];
  try {
    files = JSON.parse(row.filesJson) as SkillRecordDetail["files"];
  } catch {
    return null;
  }
  let meta: Record<string, unknown> | null = null;
  if (row.metaJson) {
    try {
      meta = JSON.parse(row.metaJson) as Record<string, unknown>;
    } catch {
      meta = null;
    }
  }
  return {
    id: row.id,
    runId: row.runId,
    format: row.format as SkillRecordDetail["format"],
    skillId: row.skillId,
    version: row.version,
    status: row.status as SkillRecordDetail["status"],
    createdAt: row.createdAt,
    files,
    meta,
  };
}

export function updateSkillRecordStatus(
  db: Database.Database,
  id: number,
  status: SkillRecordStatus,
): { changes: number } {
  const info = db
    .prepare(`UPDATE skill_records SET status = ? WHERE id = ?`)
    .run(status, id);
  return { changes: info.changes };
}

function evaluateGateDecision(
  severities: string[],
  reviewDecision?: "approved" | "rejected",
): PolicyDecision {
  if (reviewDecision === "rejected") {
    return "deny";
  }
  if (severities.includes("block")) {
    return "deny";
  }
  if (reviewDecision === "approved") {
    return "allow";
  }
  if (severities.includes("high") || severities.includes("warning")) {
    return "review_required";
  }
  return "allow";
}

export function ensureDefaultPolicyRules(db: Database.Database): void {
  const now = new Date().toISOString();
  const defaults = [
    {
      name: "require_prerequisites_section",
      severity: "warning",
      scope: "skill_markdown",
      config: JSON.stringify({ mustIncludeAny: ["Prerequisites", "前置条件"] }),
    },
    {
      name: "avoid_absolute_paths",
      severity: "high",
      scope: "skill_commands",
      config: JSON.stringify({ denyPattern: "^\\s*/" }),
    },
  ];
  const stmt = db.prepare(`
    INSERT INTO skill_policy_rules (name, severity, scope, config_json, enabled, created_at)
    SELECT @name, @severity, @scope, @config_json, 1, @created_at
    WHERE NOT EXISTS (SELECT 1 FROM skill_policy_rules WHERE name = @name)
  `);
  const tx = db.transaction(() => {
    for (const rule of defaults) {
      stmt.run({
        name: rule.name,
        severity: rule.severity,
        scope: rule.scope,
        config_json: rule.config,
        created_at: now,
      });
    }
  });
  tx();
}

export function createPolicyHitsForSkill(
  db: Database.Database,
  skillRecordId: number,
  opts?: { runId?: string | null },
): { inserted: number } {
  const skill = getSkillRecord(db, skillRecordId);
  if (!skill) {
    return { inserted: 0 };
  }
  ensureDefaultPolicyRules(db);
  const rules = db
    .prepare(
      `SELECT id, name, severity, scope, config_json AS configJson FROM skill_policy_rules WHERE enabled = 1 ORDER BY id ASC`,
    )
    .all() as Array<{
    id: number;
    name: string;
    severity: string;
    scope: string;
    configJson: string | null;
  }>;
  const now = new Date().toISOString();
  const insertHit = db.prepare(`
    INSERT INTO skill_policy_hits (
      skill_record_id, rule_id, rule_name, severity, decision, evidence_json, created_at
    ) VALUES (@skill_record_id, @rule_id, @rule_name, @severity, @decision, @evidence_json, @created_at)
  `);
  let inserted = 0;
  const fullText = skill.files.map((f) => `${f.path}\n${f.content}`).join("\n");
  const skillMd = skill.files.find((f) => f.path.endsWith("SKILL.md"))?.content ?? "";
  for (const rule of rules) {
    let matched = false;
    const evidence: Record<string, unknown> = { scope: rule.scope };
    if (rule.name === "require_prerequisites_section") {
      const ok = /(Prerequisites|前置条件)/i.test(skillMd);
      matched = !ok;
      evidence.hasPrerequisites = ok;
    } else if (rule.name === "avoid_absolute_paths") {
      const hit = /(^|\n)\s*\/[A-Za-z0-9/_-]+/m.test(fullText);
      matched = hit;
      evidence.hasAbsolutePath = hit;
    }
    if (!matched) {
      continue;
    }
    const decision = rule.severity === "block" ? "deny" : "review_required";
    insertHit.run({
      skill_record_id: skillRecordId,
      rule_id: rule.id,
      rule_name: rule.name,
      severity: rule.severity,
      decision,
      evidence_json: JSON.stringify({ ...evidence, runId: opts?.runId ?? null }),
      created_at: now,
    });
    inserted += 1;
  }
  return { inserted };
}

export function addSkillReview(
  db: Database.Database,
  input: { skillRecordId: number; reviewer: string; decision: "approved" | "rejected"; reason?: string },
): { id: number } {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `
    INSERT INTO skill_reviews (skill_record_id, reviewer, decision, reason, created_at)
    VALUES (?, ?, ?, ?, ?)
  `,
    )
    .run(input.skillRecordId, input.reviewer, input.decision, input.reason ?? null, now);
  return { id: Number(info.lastInsertRowid) };
}

export function addSkillRelease(
  db: Database.Database,
  input: { skillRecordId: number; channel: string; status: "released" | "rolled_back" | "revoked"; approvedBy: string },
): { id: number } {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `
    INSERT INTO skill_releases (skill_record_id, channel, status, approved_by, created_at)
    VALUES (?, ?, ?, ?, ?)
  `,
    )
    .run(input.skillRecordId, input.channel, input.status, input.approvedBy, now);
  return { id: Number(info.lastInsertRowid) };
}

export function getGovernanceDetail(db: Database.Database, skillRecordId: number): GovernanceDetailResponse {
  ensureDefaultPolicyRules(db);
  const rules = db
    .prepare(
      `
    SELECT id, name, severity, scope, config_json AS config, enabled, created_at AS createdAt
    FROM skill_policy_rules
    ORDER BY id DESC
  `,
    )
    .all() as Array<{
    id: number;
    name: string;
    severity: "info" | "warning" | "high" | "block";
    scope: string;
    config: string | null;
    enabled: number;
    createdAt: string;
  }>;
  const hits = db
    .prepare(
      `
    SELECT id, skill_record_id AS skillRecordId, rule_id AS ruleId, rule_name AS ruleName, severity, decision, evidence_json AS evidence, created_at AS createdAt
    FROM skill_policy_hits
    WHERE skill_record_id = ?
    ORDER BY id DESC
  `,
    )
    .all(skillRecordId) as Array<{
    id: number;
    skillRecordId: number;
    ruleId: number | null;
    ruleName: string;
    severity: "info" | "warning" | "high" | "block";
    decision: "allow" | "review_required" | "deny";
    evidence: string | null;
    createdAt: string;
  }>;
  const reviews = db
    .prepare(
      `
    SELECT id, skill_record_id AS skillRecordId, reviewer, decision, reason, created_at AS createdAt
    FROM skill_reviews
    WHERE skill_record_id = ?
    ORDER BY id DESC
  `,
    )
    .all(skillRecordId) as Array<{
    id: number;
    skillRecordId: number;
    reviewer: string;
    decision: "approved" | "rejected";
    reason: string | null;
    createdAt: string;
  }>;
  const releases = db
    .prepare(
      `
    SELECT id, skill_record_id AS skillRecordId, channel, status, approved_by AS approvedBy, created_at AS createdAt
    FROM skill_releases
    WHERE skill_record_id = ?
    ORDER BY id DESC
  `,
    )
    .all(skillRecordId) as Array<{
    id: number;
    skillRecordId: number;
    channel: string;
    status: "released" | "rolled_back" | "revoked";
    approvedBy: string;
    createdAt: string;
  }>;
  const gateDecision = evaluateGateDecision(
    hits.map((h) => h.severity),
    reviews[0]?.decision,
  );
  return {
    rules: rules.map((r) => ({
      id: r.id,
      name: r.name,
      severity: r.severity,
      scope: r.scope,
      config: r.config ? (JSON.parse(r.config) as Record<string, unknown>) : null,
      enabled: Boolean(r.enabled),
      createdAt: r.createdAt,
    })),
    hits: hits.map((h) => ({
      ...h,
      evidence: h.evidence ? (JSON.parse(h.evidence) as Record<string, unknown>) : null,
    })),
    reviews: reviews.map((r) => ({
      id: r.id,
      skillRecordId: r.skillRecordId,
      reviewer: r.reviewer,
      decision: r.decision,
      reason: r.reason ?? undefined,
      createdAt: r.createdAt,
    })),
    releases,
    gateDecision,
  };
}

export function createSkillEvalRun(db: Database.Database, body: SkillEvalRunCreateBody): { id: number } {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `
    INSERT INTO skill_eval_runs (skill_record_id, dataset, score, verdict, summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
    )
    .run(body.skillRecordId, body.dataset, body.score, body.verdict, body.summary ?? null, now);
  return { id: Number(info.lastInsertRowid) };
}

export function createSkillRuntimeFeedback(
  db: Database.Database,
  body: SkillRuntimeFeedbackCreateBody,
): { id: number } {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `
    INSERT INTO skill_runtime_feedback (
      skill_record_id, run_id, task_type, success, latency_ms, token_cost, retry_count, human_takeover, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      body.skillRecordId,
      body.runId ?? null,
      body.taskType,
      body.success ? 1 : 0,
      body.latencyMs,
      body.tokenCost,
      body.retryCount,
      body.humanTakeover ? 1 : 0,
      now,
    );
  return { id: Number(info.lastInsertRowid) };
}

export function createSkillExperiment(
  db: Database.Database,
  body: SkillExperimentCreateBody,
): { id: number } {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `
    INSERT INTO skill_experiments (
      control_skill_record_id, candidate_skill_record_id, traffic_ratio, status, created_at
    ) VALUES (?, ?, ?, ?, ?)
  `,
    )
    .run(body.controlSkillRecordId, body.candidateSkillRecordId, body.trafficRatio, body.status, now);
  return { id: Number(info.lastInsertRowid) };
}

export function listSkillExperiments(
  db: Database.Database,
  skillRecordId: number,
): Array<{
  id: number;
  controlSkillRecordId: number;
  candidateSkillRecordId: number;
  trafficRatio: number;
  status: "draft" | "running" | "stopped" | "completed";
  createdAt: string;
}> {
  const rows = db
    .prepare(
      `
    SELECT
      id AS id,
      control_skill_record_id AS controlSkillRecordId,
      candidate_skill_record_id AS candidateSkillRecordId,
      traffic_ratio AS trafficRatio,
      status AS status,
      created_at AS createdAt
    FROM skill_experiments
    WHERE control_skill_record_id = ? OR candidate_skill_record_id = ?
    ORDER BY id DESC
    LIMIT 100
  `,
    )
    .all(skillRecordId, skillRecordId) as Array<{
    id: number;
    controlSkillRecordId: number;
    candidateSkillRecordId: number;
    trafficRatio: number;
    status: "draft" | "running" | "stopped" | "completed";
    createdAt: string;
  }>;
  return rows;
}

export function getSkillFeedbackTrend(
  db: Database.Database,
  skillRecordId: number,
  windowDays: number,
): Array<{
  day: string;
  totalRuns: number;
  successRate: number;
  avgLatencyMs: number;
  avgTokenCost: number;
  humanTakeoverRate: number;
}> {
  const safeDays = Math.min(Math.max(windowDays, 1), 180);
  const cutoffIso = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `
    SELECT
      created_at AS createdAt,
      success AS success,
      latency_ms AS latencyMs,
      token_cost AS tokenCost,
      human_takeover AS humanTakeover
    FROM skill_runtime_feedback
    WHERE skill_record_id = ?
      AND created_at >= ?
    ORDER BY created_at ASC
  `,
    )
    .all(skillRecordId, cutoffIso) as Array<{
    createdAt: string;
    success: number;
    latencyMs: number;
    tokenCost: number;
    humanTakeover: number;
  }>;
  const byHour = safeDays <= 7;
  const bucketMap = new Map<
    string,
    {
      totalRuns: number;
      successSum: number;
      latencySum: number;
      tokenSum: number;
      humanTakeoverSum: number;
    }
  >();
  for (const r of rows) {
    const key = byHour
      ? `${r.createdAt.slice(0, 13)}:00`
      : r.createdAt.slice(0, 10);
    const cur = bucketMap.get(key) ?? {
      totalRuns: 0,
      successSum: 0,
      latencySum: 0,
      tokenSum: 0,
      humanTakeoverSum: 0,
    };
    cur.totalRuns += 1;
    cur.successSum += r.success;
    cur.latencySum += r.latencyMs;
    cur.tokenSum += r.tokenCost;
    cur.humanTakeoverSum += r.humanTakeover;
    bucketMap.set(key, cur);
  }
  return Array.from(bucketMap.entries()).map(([day, agg]) => ({
    day,
    totalRuns: agg.totalRuns,
    successRate: agg.totalRuns === 0 ? 0 : agg.successSum / agg.totalRuns,
    avgLatencyMs: agg.totalRuns === 0 ? 0 : agg.latencySum / agg.totalRuns,
    avgTokenCost: agg.totalRuns === 0 ? 0 : agg.tokenSum / agg.totalRuns,
    humanTakeoverRate: agg.totalRuns === 0 ? 0 : agg.humanTakeoverSum / agg.totalRuns,
  }));
}

export function getSkillScorecard(db: Database.Database, skillRecordId: number): {
  skillRecordId: number;
  totalRuns: number;
  successRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgTokenCost: number;
  humanTakeoverRate: number;
  rollbackSuggested: boolean;
  rollbackReason?: string;
} {
  const rows = db
    .prepare(
      `
    SELECT success, latency_ms AS latencyMs, token_cost AS tokenCost, human_takeover AS humanTakeover
    FROM skill_runtime_feedback
    WHERE skill_record_id = ?
    ORDER BY id DESC
    LIMIT 500
  `,
    )
    .all(skillRecordId) as Array<{
    success: number;
    latencyMs: number;
    tokenCost: number;
    humanTakeover: number;
  }>;
  const totalRuns = rows.length;
  if (totalRuns === 0) {
    return {
      skillRecordId,
      totalRuns: 0,
      successRate: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      avgTokenCost: 0,
      humanTakeoverRate: 0,
      rollbackSuggested: false,
    };
  }
  const successCount = rows.filter((r) => r.success === 1).length;
  const successRate = successCount / totalRuns;
  const avgLatencyMs = rows.reduce((s, r) => s + r.latencyMs, 0) / totalRuns;
  const avgTokenCost = rows.reduce((s, r) => s + r.tokenCost, 0) / totalRuns;
  const humanTakeoverRate = rows.filter((r) => r.humanTakeover === 1).length / totalRuns;
  const sortedLatency = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p95Index = Math.min(sortedLatency.length - 1, Math.floor(sortedLatency.length * 0.95));
  const p95LatencyMs = sortedLatency[p95Index];
  const rollbackSuggested = successRate < 0.55 || humanTakeoverRate > 0.35;
  const rollbackReason = rollbackSuggested
    ? `successRate=${successRate.toFixed(2)}, humanTakeoverRate=${humanTakeoverRate.toFixed(2)}`
    : undefined;
  return {
    skillRecordId,
    totalRuns,
    successRate,
    avgLatencyMs,
    p95LatencyMs,
    avgTokenCost,
    humanTakeoverRate,
    rollbackSuggested,
    rollbackReason,
  };
}

export function rollbackSkillRelease(db: Database.Database, skillRecordId: number, body: SkillRollbackBody): { id: number } {
  return addSkillRelease(db, {
    skillRecordId: body.targetSkillRecordId ?? skillRecordId,
    channel: "default",
    status: "rolled_back",
    approvedBy: body.operator,
  });
}

export function pickRuntimeSkill(
  db: Database.Database,
  input: { taskType: string; format?: "cursor" | "claude" },
): { matched: boolean; skillRecordId?: number } {
  const row = db
    .prepare(
      `
    SELECT sr.id AS id
    FROM skill_records sr
    JOIN skill_releases rel ON rel.skill_record_id = sr.id
    WHERE sr.status = 'accepted'
      AND rel.status = 'released'
      AND (? IS NULL OR sr.format = ?)
    ORDER BY rel.id DESC
    LIMIT 1
  `,
    )
    .get(input.format ?? null, input.format ?? null) as { id: number } | undefined;
  if (!row) {
    return { matched: false };
  }
  return { matched: true, skillRecordId: row.id };
}

export function createSkillHumanFeedback(
  db: Database.Database,
  skillRecordId: number,
  body: HumanFeedbackCreateBody,
): { id: number } {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `
    INSERT INTO skill_human_feedback (
      skill_record_id, run_id, role, sentiment, problem_type, severity, free_text, suggestion, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      skillRecordId,
      body.runId ?? null,
      body.role,
      body.sentiment,
      body.problemType,
      body.severity,
      body.freeText,
      body.suggestion ?? null,
      now,
    );
  return { id: Number(info.lastInsertRowid) };
}

export function listSkillHumanFeedback(
  db: Database.Database,
  skillRecordId: number,
  limit = 50,
): HumanFeedbackItem[] {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const rows = db
    .prepare(
      `
    SELECT
      id AS id,
      skill_record_id AS skillRecordId,
      run_id AS runId,
      role AS role,
      sentiment AS sentiment,
      problem_type AS problemType,
      severity AS severity,
      free_text AS freeText,
      suggestion AS suggestion,
      created_at AS createdAt
    FROM skill_human_feedback
    WHERE skill_record_id = ?
    ORDER BY id DESC
    LIMIT ?
  `,
    )
    .all(skillRecordId, safeLimit) as HumanFeedbackItem[];
  return rows;
}

export function listSkillVersions(db: Database.Database, skillRecordId: number): SkillVersionItem[] {
  const rows = db
    .prepare(
      `
    WITH RECURSIVE root(id) AS (
      SELECT id FROM skill_records WHERE id = ?
      UNION
      SELECT parent_skill_record_id FROM skill_records s
      JOIN root r ON s.id = r.id
      WHERE parent_skill_record_id IS NOT NULL
    )
    SELECT
      s.id AS id,
      COALESCE(s.version, 1) AS version,
      s.parent_skill_record_id AS parentSkillRecordId,
      s.status AS status,
      s.change_summary AS changeSummary,
      s.created_at AS createdAt
    FROM skill_records s
    WHERE s.id IN (SELECT id FROM root WHERE id IS NOT NULL)
       OR s.parent_skill_record_id IN (SELECT id FROM root WHERE id IS NOT NULL)
    ORDER BY version DESC, id DESC
  `,
    )
    .all(skillRecordId) as SkillVersionItem[];
  return rows;
}

export function createRegeneratedSkillDraftFromFeedback(
  db: Database.Database,
  skillRecordId: number,
  body: RegenerateFromFeedbackBody,
): { id: number; version: number } {
  const parent = db
    .prepare(
      `
    SELECT
      id AS id,
      run_id AS runId,
      format AS format,
      skill_id AS skillId,
      files_json AS filesJson,
      meta_json AS metaJson,
      COALESCE(version, 1) AS version
    FROM skill_records
    WHERE id = ?
  `,
    )
    .get(skillRecordId) as
    | {
        id: number;
        runId: string | null;
        format: "cursor" | "claude";
        skillId: string;
        filesJson: string;
        metaJson: string | null;
        version: number;
      }
    | undefined;
  if (!parent) {
    throw new Error("skill_not_found");
  }
  const feedback = listSkillHumanFeedback(db, skillRecordId, body.limit ?? 10);
  const now = new Date().toISOString();
  const changeSummary = `基于 ${feedback.length} 条人工反馈生成草稿（占位）`;
  const snapshot = JSON.stringify(
    feedback.map((f) => ({
      id: f.id,
      sentiment: f.sentiment,
      problemType: f.problemType,
      severity: f.severity,
      freeText: f.freeText,
      suggestion: f.suggestion,
    })),
  );
  const info = db
    .prepare(
      `
    INSERT INTO skill_records (
      run_id, format, skill_id, status, files_json, meta_json, created_at,
      version, parent_skill_record_id, change_summary, feedback_snapshot_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      parent.runId,
      parent.format,
      parent.skillId,
      "review_required",
      parent.filesJson,
      parent.metaJson,
      now,
      parent.version + 1,
      parent.id,
      changeSummary,
      snapshot,
    );
  return { id: Number(info.lastInsertRowid), version: parent.version + 1 };
}
