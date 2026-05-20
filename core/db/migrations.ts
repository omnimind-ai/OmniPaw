export interface Migration {
  id: number
  name: string
  sql: string
}

export const migrations: Migration[] = [
  {
    id: 1,
    name: 'create_chat_core_tables',
    sql: `
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        default_provider_id TEXT,
        default_model_id TEXT,
        system_prompt TEXT,
        context_policy_json TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        message_count INTEGER NOT NULL DEFAULT 0,
        last_message_preview TEXT,
        last_message_at INTEGER,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at
        ON chat_sessions(updated_at DESC);

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        parts_json TEXT NOT NULL,
        parent_message_id TEXT,
        root_message_id TEXT,
        checkpoint_id TEXT,
        run_id TEXT,
        provider_id TEXT,
        model_id TEXT,
        provider_message_id TEXT,
        usage_json TEXT,
        error_json TEXT,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
        ON chat_messages(session_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_checkpoint
        ON chat_messages(checkpoint_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_run
        ON chat_messages(run_id);

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        preview_path TEXT,
        extracted_text TEXT,
        extracted_text_status TEXT NOT NULL DEFAULT 'none',
        extracted_text_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_attachments_sha256
        ON attachments(sha256);

      CREATE TABLE IF NOT EXISTS message_attachments (
        message_id TEXT NOT NULL,
        attachment_id TEXT NOT NULL,
        part_index INTEGER NOT NULL,
        role TEXT NOT NULL,
        PRIMARY KEY(message_id, attachment_id, part_index),
        FOREIGN KEY(message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
        FOREIGN KEY(attachment_id) REFERENCES attachments(id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_message_attachments_attachment
        ON message_attachments(attachment_id);

      CREATE TABLE IF NOT EXISTS chat_runs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_message_id TEXT NOT NULL,
        assistant_message_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        status TEXT NOT NULL,
        idempotency_key TEXT,
        started_at INTEGER,
        finished_at INTEGER,
        abort_reason TEXT,
        usage_json TEXT,
        error_json TEXT,
        request_snapshot_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chat_runs_session_created
        ON chat_runs(session_id, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_runs_idempotency
        ON chat_runs(idempotency_key)
        WHERE idempotency_key IS NOT NULL;
    `,
  },
  {
    id: 3,
    name: 'drop_config_backed_provider_and_settings_tables',
    sql: `
      DROP TABLE IF EXISTS provider_credentials;
      DROP TABLE IF EXISTS provider_models;
      DROP TABLE IF EXISTS providers;
      DROP TABLE IF EXISTS app_settings;
    `,
  },
  {
    id: 4,
    name: 'create_cron_task_tables',
    sql: `
      CREATE TABLE IF NOT EXISTS cron_tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        note TEXT NOT NULL,
        source_session_id TEXT NOT NULL,
        target_session_id TEXT NOT NULL,
        schedule_kind TEXT NOT NULL,
        run_at INTEGER,
        cron_expression TEXT,
        timezone TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT 'idle',
        next_run_at INTEGER,
        running_at INTEGER,
        last_run_at INTEGER,
        last_completed_at INTEGER,
        last_status TEXT,
        last_error_json TEXT,
        failure_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(source_session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(target_session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_cron_tasks_due
        ON cron_tasks(enabled, next_run_at, running_at);
      CREATE INDEX IF NOT EXISTS idx_cron_tasks_source_session
        ON cron_tasks(source_session_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_cron_tasks_target_session
        ON cron_tasks(target_session_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_cron_tasks_running
        ON cron_tasks(running_at)
        WHERE running_at IS NOT NULL;

      CREATE TABLE IF NOT EXISTS cron_runs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL,
        scheduled_for INTEGER,
        started_at INTEGER,
        completed_at INTEGER,
        duration_ms INTEGER,
        result_message_id TEXT,
        result_summary TEXT,
        error_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(task_id) REFERENCES cron_tasks(id) ON DELETE CASCADE,
        FOREIGN KEY(result_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cron_runs_task_created
        ON cron_runs(task_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_cron_runs_status
        ON cron_runs(status, started_at);
    `,
  },
]
