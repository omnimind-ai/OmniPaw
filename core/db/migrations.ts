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
  {
    id: 5,
    name: 'add_chat_session_kind',
    sql: `
      ALTER TABLE chat_sessions
        ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat';

      CREATE INDEX IF NOT EXISTS idx_chat_sessions_kind_updated
        ON chat_sessions(kind, updated_at DESC);
    `,
  },
  {
    id: 6,
    name: 'create_chat_context_summaries',
    sql: `
      CREATE TABLE IF NOT EXISTS chat_context_summaries (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        summary_text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'usable',
        covered_from_message_id TEXT,
        covered_to_message_id TEXT,
        covered_from_created_at INTEGER,
        covered_to_created_at INTEGER,
        source_message_ids_json TEXT,
        provider_id TEXT,
        model_id TEXT,
        token_estimate_before INTEGER,
        token_estimate_after INTEGER,
        metadata_json TEXT,
        stale_at INTEGER,
        hidden_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chat_context_summaries_latest
        ON chat_context_summaries(session_id, status, covered_to_created_at DESC, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_context_summaries_coverage
        ON chat_context_summaries(session_id, covered_from_created_at, covered_to_created_at);
    `,
  },
  {
    id: 8,
    name: 'create_companion_memory_tables',
    sql: `
      CREATE TABLE IF NOT EXISTS companion_memory_items (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        scope TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        subject TEXT,
        content TEXT NOT NULL,
        importance INTEGER NOT NULL DEFAULT 3,
        confidence REAL NOT NULL DEFAULT 0.7,
        user_id TEXT,
        character_id TEXT,
        session_id TEXT,
        source_run_id TEXT,
        observed_at INTEGER,
        expires_at INTEGER,
        archived_at INTEGER,
        deleted_at INTEGER,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL,
        FOREIGN KEY(source_run_id) REFERENCES chat_runs(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_companion_memory_status_updated
        ON companion_memory_items(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_companion_memory_scope_status
        ON companion_memory_items(scope, status, confidence, importance);
      CREATE INDEX IF NOT EXISTS idx_companion_memory_session
        ON companion_memory_items(session_id, status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_companion_memory_character
        ON companion_memory_items(character_id, status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_companion_memory_expiry
        ON companion_memory_items(expires_at)
        WHERE expires_at IS NOT NULL;

      CREATE TABLE IF NOT EXISTS companion_memory_sources (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        session_id TEXT,
        run_id TEXT,
        message_ids_json TEXT NOT NULL,
        source_role TEXT,
        evidence_hash TEXT NOT NULL,
        source_created_at INTEGER,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(memory_id) REFERENCES companion_memory_items(id) ON DELETE CASCADE,
        FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL,
        FOREIGN KEY(run_id) REFERENCES chat_runs(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_companion_memory_sources_memory
        ON companion_memory_sources(memory_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_companion_memory_sources_session
        ON companion_memory_sources(session_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_companion_memory_sources_run
        ON companion_memory_sources(run_id);

      CREATE TABLE IF NOT EXISTS companion_memory_extraction_jobs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        session_kind TEXT,
        status TEXT NOT NULL,
        error_code TEXT,
        error_message TEXT,
        created_memory_ids_json TEXT NOT NULL DEFAULT '[]',
        started_at INTEGER,
        finished_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(run_id) REFERENCES chat_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_companion_memory_jobs_run
        ON companion_memory_extraction_jobs(run_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_companion_memory_jobs_status
        ON companion_memory_extraction_jobs(status, updated_at DESC);

      CREATE VIRTUAL TABLE IF NOT EXISTS companion_memory_fts USING fts5(
        memory_id UNINDEXED,
        subject,
        content,
        tokenize = 'unicode61'
      );
    `,
  },
  {
    id: 9,
    name: 'create_companion_memory_embeddings',
    sql: `
      CREATE TABLE IF NOT EXISTS companion_memory_embeddings (
        memory_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        dimension INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        vector_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(memory_id) REFERENCES companion_memory_items(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_companion_memory_embeddings_model
        ON companion_memory_embeddings(provider, model, updated_at DESC);
    `,
  },
  {
    id: 10,
    name: 'extend_companion_memory_semantic_metadata',
    sql: `
      ALTER TABLE companion_memory_extraction_jobs
        ADD COLUMN diagnostics_json TEXT;

      CREATE TABLE IF NOT EXISTS companion_memory_links (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        linked_memory_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.7,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(memory_id) REFERENCES companion_memory_items(id) ON DELETE CASCADE,
        FOREIGN KEY(linked_memory_id) REFERENCES companion_memory_items(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_companion_memory_links_unique
        ON companion_memory_links(memory_id, linked_memory_id, relation);
      CREATE INDEX IF NOT EXISTS idx_companion_memory_links_memory
        ON companion_memory_links(memory_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_companion_memory_links_linked
        ON companion_memory_links(linked_memory_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS companion_memory_proposals (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        memory_id TEXT,
        related_memory_id TEXT,
        proposed_content TEXT,
        reason TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.7,
        source TEXT NOT NULL DEFAULT 'maintenance',
        run_id TEXT,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(memory_id) REFERENCES companion_memory_items(id) ON DELETE SET NULL,
        FOREIGN KEY(related_memory_id) REFERENCES companion_memory_items(id) ON DELETE SET NULL,
        FOREIGN KEY(run_id) REFERENCES chat_runs(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_companion_memory_proposals_status
        ON companion_memory_proposals(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_companion_memory_proposals_memory
        ON companion_memory_proposals(memory_id, status, updated_at DESC);
    `,
  },
  {
    id: 11,
    name: 'create_cat_pet_state_tables',
    sql: `
      CREATE TABLE IF NOT EXISTS cat_pet_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        affection INTEGER NOT NULL DEFAULT 50,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT OR IGNORE INTO cat_pet_state (id, affection, created_at, updated_at)
      VALUES (1, 50, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);

      CREATE TABLE IF NOT EXISTS cat_pet_interaction_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        delta INTEGER NOT NULL,
        outcome TEXT NOT NULL,
        affection_before INTEGER NOT NULL,
        affection_after INTEGER NOT NULL,
        performed_at INTEGER NOT NULL,
        performed_date TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cat_pet_log_date_action
        ON cat_pet_interaction_log(performed_date, action);
      CREATE INDEX IF NOT EXISTS idx_cat_pet_log_performed_at
        ON cat_pet_interaction_log(performed_at DESC);
    `,
  },
  {
    id: 12,
    name: 'extend_cat_pet_mood_and_interactions',
    sql: `
      ALTER TABLE cat_pet_state
        ADD COLUMN mood TEXT NOT NULL DEFAULT 'normal';
      ALTER TABLE cat_pet_state
        ADD COLUMN mood_score INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE cat_pet_state
        ADD COLUMN last_launch_at INTEGER;
      ALTER TABLE cat_pet_state
        ADD COLUMN last_seen_at INTEGER;
      ALTER TABLE cat_pet_state
        ADD COLUMN launch_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE cat_pet_state
        ADD COLUMN custom_interactions_json TEXT;

      UPDATE cat_pet_state
      SET mood = CASE
          WHEN affection <= 30 THEN 'sad'
          WHEN affection <= 90 THEN 'down'
          WHEN affection <= 150 THEN 'normal'
          ELSE 'happy'
        END,
        mood_score = CASE
          WHEN affection <= 30 THEN -45
          WHEN affection <= 90 THEN -18
          WHEN affection <= 150 THEN 0
          ELSE 32
        END,
        last_seen_at = COALESCE(last_seen_at, updated_at),
        last_launch_at = COALESCE(last_launch_at, updated_at);

      ALTER TABLE cat_pet_interaction_log
        ADD COLUMN mood_delta INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE cat_pet_interaction_log
        ADD COLUMN mood_before TEXT;
      ALTER TABLE cat_pet_interaction_log
        ADD COLUMN mood_after TEXT;
      ALTER TABLE cat_pet_interaction_log
        ADD COLUMN mood_score_before INTEGER;
      ALTER TABLE cat_pet_interaction_log
        ADD COLUMN mood_score_after INTEGER;
      ALTER TABLE cat_pet_interaction_log
        ADD COLUMN risk TEXT;
      ALTER TABLE cat_pet_interaction_log
        ADD COLUMN label TEXT;
    `,
  },
  {
    id: 13,
    name: 'create_cat_pet_gift_unlocks',
    sql: `
      CREATE TABLE IF NOT EXISTS cat_pet_gift_unlocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_id TEXT NOT NULL,
        gift_id TEXT NOT NULL,
        unlocked_at INTEGER NOT NULL,
        UNIQUE(role_id, gift_id)
      );

      CREATE INDEX IF NOT EXISTS idx_cat_pet_gift_unlocks_role_time
        ON cat_pet_gift_unlocks(role_id, unlocked_at DESC);
    `,
  },
]
