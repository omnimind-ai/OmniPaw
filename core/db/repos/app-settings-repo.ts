import type { DatabaseConnection } from '../client'
import { decodeJson, encodeJson } from '../json'

interface AppSettingRow {
  key: string
  value_json: string
  created_at: number
  updated_at: number
}

export class AppSettingsRepo {
  constructor(private readonly db: DatabaseConnection) {}

  getJson<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT * FROM app_settings WHERE key = ?').get(key) as
      | AppSettingRow
      | undefined
    return row ? decodeJson<T>(row.value_json, fallback) : fallback
  }

  setJson(key: string, value: unknown): void {
    const now = Date.now()
    this.db
      .prepare(
        `
          INSERT INTO app_settings (key, value_json, created_at, updated_at)
          VALUES (@key, @valueJson, @createdAt, @updatedAt)
          ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = excluded.updated_at
        `,
      )
      .run({
        key,
        valueJson: encodeJson(value) ?? 'null',
        createdAt: now,
        updatedAt: now,
      })
  }
}
