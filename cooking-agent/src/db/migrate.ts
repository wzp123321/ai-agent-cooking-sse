import { getDb } from './index'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '新对话',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL,
  role         TEXT NOT NULL CHECK(role IN ('system','user','assistant','tool')),
  content      TEXT NOT NULL,
  tool_call_id TEXT,
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session
  ON messages(session_id, created_at);
`

export function runMigrations(): void {
  const db = getDb()
  db.exec(SCHEMA)
  console.info('[DB] ✅ 数据库迁移完成')
}