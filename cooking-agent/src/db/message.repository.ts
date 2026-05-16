import { getDb } from './index'
import type { Message } from '../types'

export interface MessageRow {
  id: number
  session_id: string
  role: string
  content: string
  tool_call_id: string | null
  created_at: number
}

export class MessageRepository {
  insert(sessionId: string, msg: Message, now: number): MessageRow {
    const db = getDb()
    const result = db.prepare(
      `INSERT INTO messages (session_id, role, content, tool_call_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(sessionId, msg.role, msg.content, msg.tool_call_id ?? null, now)
    return {
      id: result.lastInsertRowid as number,
      session_id: sessionId,
      role: msg.role,
      content: msg.content,
      tool_call_id: msg.tool_call_id ?? null,
      created_at: now,
    }
  }

  findBySessionId(sessionId: string): MessageRow[] {
    const db = getDb()
    return db
      .prepare(
        'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC',
      )
      .all(sessionId) as MessageRow[]
  }

  findHistoryBySessionId(sessionId: string): Message[] {
    const rows = this.findBySessionId(sessionId)
    return rows
      .filter((r) => r.role !== 'system')
      .map((r) => ({
        role: r.role as Message['role'],
        content: r.content,
        tool_call_id: r.tool_call_id ?? undefined,
      }))
  }

  deleteBySessionId(sessionId: string): number {
    const db = getDb()
    const result = db
      .prepare('DELETE FROM messages WHERE session_id = ?')
      .run(sessionId)
    return result.changes
  }

  countBySessionId(sessionId: string): number {
    const db = getDb()
    const row = db
      .prepare('SELECT COUNT(*) as cnt FROM messages WHERE session_id = ? AND role != ?')
      .get(sessionId, 'system') as { cnt: number }
    return row.cnt
  }
}

export const messageRepo = new MessageRepository()