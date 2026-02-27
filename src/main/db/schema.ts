import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    path: text('path').notNull(),
    gitRemote: text('git_remote'),
    gitBranch: text('git_branch'),
    baseRef: text('base_ref'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pathIdx: uniqueIndex('idx_projects_path').on(table.path),
  }),
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    branch: text('branch').notNull(),
    path: text('path').notNull(),
    status: text('status').notNull().default('idle'),
    useWorktree: integer('use_worktree', { mode: 'boolean' }).default(true),
    permissionMode: text('permission_mode')
      .notNull()
      .default('paranoid')
      .$type<'paranoid' | 'safe' | 'yolo'>(),
    model: text('model').notNull().default('opus').$type<'opus' | 'sonnet' | 'haiku'>(),
    linkedIssues: text('linked_issues'),
    archivedAt: text('archived_at'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    projectIdIdx: index('idx_tasks_project_id').on(table.projectId),
  }),
);

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
    isMain: integer('is_main', { mode: 'boolean' }).notNull().default(false),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    taskIdIdx: index('idx_conversations_task_id').on(table.taskId),
  }),
);

export const libraryCommands = sqliteTable(
  'library_commands',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    displayName: text('display_name').notNull(),
    filePath: text('file_path').notNull(),
    type: text('type', { enum: ['command', 'skill'] })
      .notNull()
      .default('command'),
    enabledByDefault: integer('enabled_by_default', { mode: 'boolean' }).default(true),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    filePathIdx: uniqueIndex('idx_library_commands_file_path').on(table.filePath),
  }),
);

export const taskCommands = sqliteTable(
  'task_commands',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    commandId: text('command_id')
      .notNull()
      .references(() => libraryCommands.id, { onDelete: 'cascade' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    taskCommandIdx: uniqueIndex('idx_task_commands_task_command').on(table.taskId, table.commandId),
    taskIdIdx: index('idx_task_commands_task_id').on(table.taskId),
  }),
);

export const libraryMcps = sqliteTable(
  'library_mcps',
  {
    id: text('id').primaryKey(),
    sourceFilePath: text('source_file_path').notNull(),
    name: text('name').notNull(),
    config: text('config').notNull(), // JSON: { command, args, env? }
    enabledByDefault: integer('enabled_by_default', { mode: 'boolean' }).default(true),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    sourceNameIdx: uniqueIndex('idx_library_mcps_source_name').on(table.sourceFilePath, table.name),
  }),
);

export const taskMcps = sqliteTable(
  'task_mcps',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    mcpId: text('mcp_id')
      .notNull()
      .references(() => libraryMcps.id, { onDelete: 'cascade' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    taskMcpIdx: uniqueIndex('idx_task_mcps_task_mcp').on(table.taskId, table.mcpId),
    taskIdIdx: index('idx_task_mcps_task_id').on(table.taskId),
  }),
);
