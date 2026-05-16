import Database from 'better-sqlite3'
import path from 'node:path'

const DB_PATH = path.resolve(__dirname, '..', '..', 'data', 'cooking.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const fs = require('node:fs')
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    console.info(`[DB] 📂 数据库已连接：${DB_PATH}`)
  }
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    console.info('[DB] 🔒 数据库已关闭')
  }
}