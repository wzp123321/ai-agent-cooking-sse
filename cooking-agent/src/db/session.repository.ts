import { getDb } from './index'

export interface SessionRow {
  id: string
  title: string
  created_at: number
  updated_at: number
}

export class SessionRepository {
  create(id: string, title: string, now: number): SessionRow {
    const db = getDb()
    db.prepare(
      `INSERT INTO sessions (id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run(id, title, now, now)
    return { id, title, created_at: now, updated_at: now }
  }

  findById(id: string): SessionRow | undefined {
    const db = getDb()
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | SessionRow
      | undefined
  }

  findAll(): SessionRow[] {
    const db = getDb()
    return db
      .prepare('SELECT * FROM sessions ORDER BY updated_at DESC')
      .all() as SessionRow[]
  }

  updateTitle(id: string, title: string, now: number): void {
    const db = getDb()
    db.prepare(
      `UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?`,
    ).run(title, now, id)
  }

  touch(id: string, now: number): void {
    const db = getDb()
    db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, id)
  }

  deleteById(id: string): boolean {
    const db = getDb()
    const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    return result.changes > 0
  }
}

export const sessionRepo = new SessionRepository()