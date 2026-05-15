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

      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        api TEXT NOT NULL,
        base_url TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        credential_ref TEXT,
        auth_header TEXT,
        headers_json TEXT,
        extra_body_json TEXT,
        default_model_id TEXT,
        capabilities_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS provider_models (
        provider_id TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        remote_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        input_json TEXT NOT NULL,
        supports_streaming INTEGER NOT NULL DEFAULT 1,
        supports_tools INTEGER NOT NULL DEFAULT 0,
        supports_reasoning INTEGER NOT NULL DEFAULT 0,
        context_window INTEGER,
        max_output_tokens INTEGER,
        pricing_json TEXT,
        compat_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(provider_id, id),
        FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS provider_credentials (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        encrypted_value TEXT,
        env_var TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_provider_credentials_provider
        ON provider_credentials(provider_id);

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
]
