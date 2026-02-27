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
      auto_approve INTEGER DEFAULT 0,
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

  rawDb.pragma('foreign_keys = ON');
}
