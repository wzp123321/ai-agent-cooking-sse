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
  tool_calls   TEXT,
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session
  ON messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS user_profiles (
  id           TEXT PRIMARY KEY DEFAULT 'default',
  allergies    TEXT DEFAULT '[]',
  diet_type    TEXT DEFAULT '',
  skill_level  TEXT DEFAULT 'intermediate',
  disliked     TEXT DEFAULT '[]',
  calorie_goal INTEGER DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
`

export function runMigrations(): void {
  const db = getDb()
  db.exec(SCHEMA)

  const cols = db.prepare("PRAGMA table_info('messages')").all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'tool_calls')) {
    db.exec('ALTER TABLE messages ADD COLUMN tool_calls TEXT')
    console.info('[DB] ✅ 新增 messages.tool_calls 列')
  }

  console.info('[DB] ✅ 数据库迁移完成')
}