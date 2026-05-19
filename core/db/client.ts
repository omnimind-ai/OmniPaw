import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Logger } from '@core/logging'
import Database from 'better-sqlite3'
import { migrations } from './migrations'

export type DatabaseConnection = Database.Database

export interface DatabaseClientOptions {
  path?: string
  appName?: string
  logger?: Logger
}

export class DatabaseClient {
  readonly path: string
  private connection?: DatabaseConnection
  private readonly logger?: Logger

  constructor(options: DatabaseClientOptions = {}) {
    this.path = options.path ?? resolveDatabasePath(options.appName)
    this.logger = options.logger
  }

  get ready(): boolean {
    return this.connection !== undefined
  }

  connect(): DatabaseConnection {
    if (this.connection) {
      return this.connection
    }

    const startedAt = Date.now()
    this.logger?.info('Opening database connection.', { path: this.path })
    mkdirSync(dirname(this.path), { recursive: true })
    const db = new Database(this.path)
    try {
      db.pragma('foreign_keys = ON')
      db.pragma('journal_mode = WAL')
      db.pragma('busy_timeout = 5000')
      const appliedMigrations = runMigrations(db)
      this.connection = db
      this.logger?.info('Database ready.', {
        path: this.path,
        appliedMigrations,
        durationMs: Date.now() - startedAt,
      })
      return db
    } catch (error) {
      this.logger?.error('Database initialization failed.', {
        path: this.path,
        durationMs: Date.now() - startedAt,
        error,
      })
      db.close()
      throw error
    }
  }

  get db(): DatabaseConnection {
    return this.connect()
  }

  close(): void {
    this.connection?.close()
    if (this.connection) {
      this.logger?.info('Database connection closed.', { path: this.path })
    }
    this.connection = undefined
  }
}

export function resolveDatabasePath(appName = 'OpenOmniClaw'): string {
  const electronApp = getElectronApp()
  if (electronApp?.isReady?.()) {
    return join(electronApp.getPath('userData'), 'openomniclaw.sqlite3')
  }

  const base =
    process.env.OPENOMNICLAW_DB_DIR ??
    process.env.XDG_DATA_HOME ??
    join(process.env.HOME ?? process.cwd(), '.local', 'share')

  return join(base, appName, 'openomniclaw.sqlite3')
}

function getElectronApp(): Electron.App | undefined {
  try {
    const require = createRequire(import.meta.url)
    return (require('electron') as { app?: Electron.App }).app
  } catch {
    return undefined
  }
}

export function runMigrations(db: DatabaseConnection): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `)

  const applied = new Set(
    db
      .prepare('SELECT id FROM schema_migrations')
      .all()
      .map((row) => (row as { id: number }).id)
  )

  let appliedCount = 0
  const apply = db.transaction(() => {
    for (const migration of migrations) {
      if (applied.has(migration.id)) {
        continue
      }

      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
        migration.id,
        migration.name,
        Date.now()
      )
      appliedCount += 1
    }
  })

  apply()
  return appliedCount
}
