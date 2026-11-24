import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const instanceDir = path.resolve(process.cwd(), 'instance');
const uploadsDir = path.resolve(process.cwd(), 'uploads');
const reportsDir = path.resolve(process.cwd(), 'generated_reports');

for (const dir of [instanceDir, uploadsDir, reportsDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const dbPath = path.join(instanceDir, 'statlytics.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      avatar_url TEXT DEFAULT NULL,
      theme_preference TEXT NOT NULL DEFAULT 'light',
      notifications_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      remember_me INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS research_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      research_question TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS datasets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER DEFAULT NULL,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'upload',
      row_count INTEGER NOT NULL DEFAULT 0,
      col_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS dataset_variables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      data_type TEXT NOT NULL DEFAULT 'Text',
      measurement_level TEXT NOT NULL DEFAULT 'Nominal',
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dataset_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id INTEGER NOT NULL,
      row_index INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS statistical_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER DEFAULT NULL,
      dataset_id INTEGER DEFAULT NULL,
      title TEXT NOT NULL,
      procedure_name TEXT NOT NULL,
      research_question TEXT DEFAULT '',
      variables_json TEXT NOT NULL DEFAULT '{}',
      sample_size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE SET NULL,
      FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS analysis_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      analysis_id INTEGER NOT NULL UNIQUE,
      descriptive_stats_json TEXT NOT NULL DEFAULT '{}',
      test_results_json TEXT NOT NULL DEFAULT '{}',
      effect_size_json TEXT NOT NULL DEFAULT '{}',
      confidence_intervals_json TEXT NOT NULL DEFAULT '{}',
      diagnostics_json TEXT NOT NULL DEFAULT '[]',
      technical_interpretation TEXT NOT NULL DEFAULT '',
      simplified_interpretation TEXT NOT NULL DEFAULT '',
      visualization_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (analysis_id) REFERENCES statistical_analyses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS generated_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      analysis_id INTEGER DEFAULT NULL,
      project_id INTEGER DEFAULT NULL,
      title TEXT NOT NULL,
      format TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (analysis_id) REFERENCES statistical_analyses(id) ON DELETE SET NULL,
      FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ai_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER DEFAULT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ai_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      context_json TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      extracted_text TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (message_id) REFERENCES ai_messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS research_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_projects_user ON research_projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_datasets_user ON datasets(user_id);
    CREATE INDEX IF NOT EXISTS idx_analyses_user ON statistical_analyses(user_id);
    CREATE INDEX IF NOT EXISTS idx_reports_user ON generated_reports(user_id);
  `);
}

export function getStoragePaths() {
  return { instanceDir, uploadsDir, reportsDir, dbPath };
}
