import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDb(filePath: string): Database.Database {
  mkdirSync(dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      last_event_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      provider TEXT NOT NULL,
      kind TEXT NOT NULL,
      ts TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      UNIQUE (run_id, agent_id, seq),
      FOREIGN KEY (run_id) REFERENCES runs (run_id)
    );
    CREATE INDEX IF NOT EXISTS idx_events_run_seq ON events (run_id, seq);
    CREATE INDEX IF NOT EXISTS idx_events_run_agent ON events (run_id, agent_id);
    CREATE TABLE IF NOT EXISTS projects (
      project_key TEXT PRIMARY KEY,
      project_name TEXT NOT NULL,
      project_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_key TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_agent_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      time_start TEXT NOT NULL,
      time_end TEXT NOT NULL,
      preview_excerpt TEXT NOT NULL,
      raw_ref TEXT NOT NULL,
      content_text TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (project_key, source_type, source_agent_id, session_id),
      FOREIGN KEY (project_key) REFERENCES projects (project_key)
    );
    CREATE INDEX IF NOT EXISTS idx_session_project_agent_time
      ON session_index (project_key, source_agent_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_session_updated_at
      ON session_index (updated_at DESC);
    CREATE TABLE IF NOT EXISTS skill_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT,
      format TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      status TEXT NOT NULL,
      files_json TEXT NOT NULL,
      meta_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs (run_id)
    );
    CREATE INDEX IF NOT EXISTS idx_skill_records_run ON skill_records (run_id);
    CREATE INDEX IF NOT EXISTS idx_skill_records_created ON skill_records (created_at DESC);
    CREATE TABLE IF NOT EXISTS async_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      result_ref TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_async_jobs_status ON async_jobs (status, created_at DESC);
    CREATE TABLE IF NOT EXISTS skill_policy_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      severity TEXT NOT NULL,
      scope TEXT NOT NULL,
      config_json TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_skill_policy_rules_enabled ON skill_policy_rules (enabled, id DESC);
    CREATE TABLE IF NOT EXISTS skill_policy_hits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_record_id INTEGER NOT NULL,
      rule_id INTEGER,
      rule_name TEXT NOT NULL,
      severity TEXT NOT NULL,
      decision TEXT NOT NULL,
      evidence_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (skill_record_id) REFERENCES skill_records (id),
      FOREIGN KEY (rule_id) REFERENCES skill_policy_rules (id)
    );
    CREATE INDEX IF NOT EXISTS idx_skill_policy_hits_record ON skill_policy_hits (skill_record_id, id DESC);
    CREATE TABLE IF NOT EXISTS skill_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_record_id INTEGER NOT NULL,
      reviewer TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (skill_record_id) REFERENCES skill_records (id)
    );
    CREATE INDEX IF NOT EXISTS idx_skill_reviews_record ON skill_reviews (skill_record_id, id DESC);
    CREATE TABLE IF NOT EXISTS skill_releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_record_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      approved_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (skill_record_id) REFERENCES skill_records (id)
    );
    CREATE INDEX IF NOT EXISTS idx_skill_releases_record ON skill_releases (skill_record_id, id DESC);
    CREATE TABLE IF NOT EXISTS skill_eval_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_record_id INTEGER NOT NULL,
      dataset TEXT NOT NULL,
      score REAL NOT NULL,
      verdict TEXT NOT NULL,
      summary TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (skill_record_id) REFERENCES skill_records (id)
    );
    CREATE INDEX IF NOT EXISTS idx_skill_eval_runs_record ON skill_eval_runs (skill_record_id, id DESC);
    CREATE TABLE IF NOT EXISTS skill_runtime_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_record_id INTEGER NOT NULL,
      run_id TEXT,
      task_type TEXT NOT NULL,
      success INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL,
      token_cost REAL NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0,
      human_takeover INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (skill_record_id) REFERENCES skill_records (id),
      FOREIGN KEY (run_id) REFERENCES runs (run_id)
    );
    CREATE INDEX IF NOT EXISTS idx_skill_feedback_record ON skill_runtime_feedback (skill_record_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_skill_feedback_task_type ON skill_runtime_feedback (task_type, id DESC);
    CREATE TABLE IF NOT EXISTS skill_experiments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      control_skill_record_id INTEGER NOT NULL,
      candidate_skill_record_id INTEGER NOT NULL,
      traffic_ratio REAL NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (control_skill_record_id) REFERENCES skill_records (id),
      FOREIGN KEY (candidate_skill_record_id) REFERENCES skill_records (id)
    );
    CREATE INDEX IF NOT EXISTS idx_skill_experiments_candidate ON skill_experiments (candidate_skill_record_id, id DESC);
    CREATE TABLE IF NOT EXISTS skill_human_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_record_id INTEGER NOT NULL,
      run_id TEXT,
      role TEXT NOT NULL,
      sentiment TEXT NOT NULL,
      problem_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      free_text TEXT NOT NULL,
      suggestion TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (skill_record_id) REFERENCES skill_records (id),
      FOREIGN KEY (run_id) REFERENCES runs (run_id)
    );
    CREATE INDEX IF NOT EXISTS idx_skill_human_feedback_record ON skill_human_feedback (skill_record_id, id DESC);
  `);
  ensureSessionTokenColumns(db);
  ensureSkillRecordVersionColumns(db);
  return db;
}

function ensureSessionTokenColumns(db: Database.Database): void {
  const columns = db
    .prepare("PRAGMA table_info(session_index)")
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((col) => col.name));
  if (!names.has("input_tokens")) {
    db.exec("ALTER TABLE session_index ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("output_tokens")) {
    db.exec("ALTER TABLE session_index ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("total_tokens")) {
    db.exec("ALTER TABLE session_index ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0");
  }
}

function ensureSkillRecordVersionColumns(db: Database.Database): void {
  const columns = db
    .prepare("PRAGMA table_info(skill_records)")
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((col) => col.name));
  if (!names.has("version")) {
    db.exec("ALTER TABLE skill_records ADD COLUMN version INTEGER NOT NULL DEFAULT 1");
  }
  if (!names.has("parent_skill_record_id")) {
    db.exec("ALTER TABLE skill_records ADD COLUMN parent_skill_record_id INTEGER");
  }
  if (!names.has("change_summary")) {
    db.exec("ALTER TABLE skill_records ADD COLUMN change_summary TEXT");
  }
  if (!names.has("feedback_snapshot_json")) {
    db.exec("ALTER TABLE skill_records ADD COLUMN feedback_snapshot_json TEXT");
  }
}
