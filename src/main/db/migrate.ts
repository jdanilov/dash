import { getRawDb } from './client';

/**
 * Run schema migrations using raw SQL.
 * Creates tables if they don't exist.
 */
export function runMigrations(): void {
  const rawDb = getRawDb();
  if (!rawDb) throw new Error('Raw database not available');

  rawDb.pragma('foreign_keys = OFF');

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      git_remote TEXT,
      git_branch TEXT,
      base_ref TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  rawDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_path ON projects(path);`);

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      branch TEXT NOT NULL,
      path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      use_worktree INTEGER DEFAULT 1,
      permission_mode TEXT NOT NULL DEFAULT 'paranoid' CHECK(permission_mode IN ('paranoid', 'safe', 'yolo')),
      archived_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);`);

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      is_main INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_task_id ON conversations(task_id);`);

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS library_commands (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'command',
      enabled_by_default INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  rawDb.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_library_commands_file_path ON library_commands(file_path);`,
  );

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS task_commands (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      command_id TEXT NOT NULL REFERENCES library_commands(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  rawDb.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_task_commands_task_command ON task_commands(task_id, command_id);`,
  );
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_task_commands_task_id ON task_commands(task_id);`);

  // Migrations for existing databases
  try {
    rawDb.exec(`ALTER TABLE tasks ADD COLUMN auto_approve INTEGER DEFAULT 0`);
  } catch {
    /* already exists */
  }
  try {
    rawDb.exec(`ALTER TABLE tasks ADD COLUMN linked_issues TEXT`);
  } catch {
    /* already exists */
  }
  try {
    rawDb.exec(`ALTER TABLE library_commands ADD COLUMN type TEXT NOT NULL DEFAULT 'command'`);
  } catch {
    /* already exists */
  }

  // Migration: Add permission_mode column
  try {
    rawDb.exec(`ALTER TABLE tasks ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'paranoid'`);
  } catch {
    /* already exists */
  }

  // Migration: Migrate auto_approve to permission_mode
  try {
    // Migrate any tasks that still have auto_approve=1 but haven't been converted to 'yolo'
    rawDb.exec(`
      UPDATE tasks
      SET permission_mode = CASE
        WHEN auto_approve = 1 THEN 'yolo'
        ELSE 'paranoid'
      END
      WHERE permission_mode = 'paranoid' AND auto_approve IS NOT NULL
    `);
  } catch (err) {
    console.error('[migrate] Failed to migrate auto_approve to permission_mode:', err);
  }

  // MCP Library tables
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS library_mcps (
      id TEXT PRIMARY KEY,
      source_file_path TEXT NOT NULL,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      enabled_by_default INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  rawDb.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_library_mcps_source_name ON library_mcps(source_file_path, name);`,
  );

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS task_mcps (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      mcp_id TEXT NOT NULL REFERENCES library_mcps(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  rawDb.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_task_mcps_task_mcp ON task_mcps(task_id, mcp_id);`,
  );
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_task_mcps_task_id ON task_mcps(task_id);`);

  // Migration: Add model column for Claude model selection
  try {
    rawDb.exec(`ALTER TABLE tasks ADD COLUMN model TEXT NOT NULL DEFAULT 'opus'`);
  } catch {
    /* already exists */
  }

  // Migration: Add default_metaprompts column for project-level metaprompt defaults
  try {
    rawDb.exec(`ALTER TABLE projects ADD COLUMN default_metaprompts TEXT`);
  } catch {
    /* already exists */
  }

  // Migration: Add default_disabled_commands column for project-level command/skill defaults
  try {
    rawDb.exec(`ALTER TABLE projects ADD COLUMN default_disabled_commands TEXT`);
  } catch {
    /* already exists */
  }

  // Migration: Add default_disabled_mcps column for project-level MCP defaults
  try {
    rawDb.exec(`ALTER TABLE projects ADD COLUMN default_disabled_mcps TEXT`);
  } catch {
    /* already exists */
  }

  rawDb.pragma('foreign_keys = ON');
}
