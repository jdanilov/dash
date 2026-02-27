import { eq, desc, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { initDb, getDb } from '../db/client';
import { runMigrations } from '../db/migrate';
import { projects, tasks, conversations, libraryCommands, taskCommands } from '../db/schema';
import type { Project, Task, Conversation, LibraryCommand, TaskCommand } from '@shared/types';

export class DatabaseService {
  private static initialized = false;

  static initialize(): void {
    if (this.initialized) return;

    initDb();
    runMigrations();
    this.initialized = true;
  }

  // ── Projects ─────────────────────────────────────────────

  static getProjects(): Project[] {
    const db = getDb();
    const rows = db.select().from(projects).all();
    return rows.map(this.mapProject);
  }

  static saveProject(data: Partial<Project> & { name: string; path: string }): Project {
    const db = getDb();
    const id = data.id || randomUUID();
    const now = new Date().toISOString();

    db.insert(projects)
      .values({
        id,
        name: data.name,
        path: data.path,
        gitRemote: data.gitRemote ?? null,
        gitBranch: data.gitBranch ?? null,
        baseRef: data.baseRef ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          name: data.name,
          path: data.path,
          gitRemote: data.gitRemote ?? null,
          gitBranch: data.gitBranch ?? null,
          baseRef: data.baseRef ?? null,
          updatedAt: now,
        },
      })
      .run();

    const rows = db.select().from(projects).where(eq(projects.id, id)).all();
    return this.mapProject(rows[0]);
  }

  static deleteProject(id: string): void {
    const db = getDb();
    db.delete(projects).where(eq(projects.id, id)).run();
  }

  // ── Tasks ────────────────────────────────────────────────

  static getTasks(projectId: string): Task[] {
    const db = getDb();
    const rows = db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(desc(tasks.createdAt))
      .all();
    return rows.map(this.mapTask);
  }

  static saveTask(
    data: Partial<Task> & { projectId: string; name: string; branch: string; path: string },
  ): Task {
    const db = getDb();
    const id = data.id || randomUUID();
    const now = new Date().toISOString();

    const linkedIssuesJson = data.linkedIssues ? JSON.stringify(data.linkedIssues) : null;

    db.insert(tasks)
      .values({
        id,
        projectId: data.projectId,
        name: data.name,
        branch: data.branch,
        path: data.path,
        status: data.status ?? 'idle',
        useWorktree: data.useWorktree ?? true,
        autoApprove: data.autoApprove ?? false,
        linkedIssues: linkedIssuesJson,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: tasks.id,
        set: {
          name: data.name,
          branch: data.branch,
          path: data.path,
          status: data.status ?? 'idle',
          linkedIssues: linkedIssuesJson,
          updatedAt: now,
        },
      })
      .run();

    const rows = db.select().from(tasks).where(eq(tasks.id, id)).all();
    return this.mapTask(rows[0]);
  }

  static deleteTask(id: string): void {
    const db = getDb();
    db.delete(tasks).where(eq(tasks.id, id)).run();
  }

  static archiveTask(id: string): void {
    const db = getDb();
    db.update(tasks)
      .set({ archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(eq(tasks.id, id))
      .run();
  }

  static restoreTask(id: string): void {
    const db = getDb();
    db.update(tasks)
      .set({ archivedAt: null, updatedAt: new Date().toISOString() })
      .where(eq(tasks.id, id))
      .run();
  }

  // ── Conversations ────────────────────────────────────────

  static getConversations(taskId: string): Conversation[] {
    const db = getDb();
    const rows = db.select().from(conversations).where(eq(conversations.taskId, taskId)).all();
    return rows.map(this.mapConversation);
  }

  static getOrCreateDefaultConversation(taskId: string): Conversation {
    const db = getDb();

    // Check if main conversation exists
    const existing = db.select().from(conversations).where(eq(conversations.taskId, taskId)).all();

    const main = existing.find((c) => c.isMain);
    if (main) return this.mapConversation(main);

    // Create default conversation
    const id = randomUUID();
    const now = new Date().toISOString();
    db.insert(conversations)
      .values({
        id,
        taskId,
        title: 'Main',
        isActive: true,
        isMain: true,
        displayOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const rows = db.select().from(conversations).where(eq(conversations.id, id)).all();
    return this.mapConversation(rows[0]);
  }

  // ── Mappers ──────────────────────────────────────────────

  private static mapProject(row: typeof projects.$inferSelect): Project {
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      gitRemote: row.gitRemote,
      gitBranch: row.gitBranch,
      baseRef: row.baseRef,
      createdAt: row.createdAt ?? '',
      updatedAt: row.updatedAt ?? '',
    };
  }

  private static mapTask(row: typeof tasks.$inferSelect): Task {
    let linkedIssues: number[] | null = null;
    if (row.linkedIssues) {
      try {
        linkedIssues = JSON.parse(row.linkedIssues);
      } catch {
        // Corrupted JSON — ignore
      }
    }

    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      branch: row.branch,
      path: row.path,
      status: row.status,
      useWorktree: row.useWorktree ?? true,
      autoApprove: row.autoApprove ?? false,
      linkedIssues,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt ?? '',
      updatedAt: row.updatedAt ?? '',
    };
  }

  private static mapConversation(row: typeof conversations.$inferSelect): Conversation {
    return {
      id: row.id,
      taskId: row.taskId,
      title: row.title,
      isActive: row.isActive ?? false,
      isMain: row.isMain ?? false,
      displayOrder: row.displayOrder,
      createdAt: row.createdAt ?? '',
      updatedAt: row.updatedAt ?? '',
    };
  }

  // ── Library Commands ─────────────────────────────────────

  static getAllLibraryCommands(): LibraryCommand[] {
    const db = getDb();
    const rows = db.select().from(libraryCommands).all();
    return rows.map(this.mapLibraryCommand);
  }

  static getLibraryCommand(id: string): LibraryCommand | null {
    const db = getDb();
    const rows = db.select().from(libraryCommands).where(eq(libraryCommands.id, id)).all();
    return rows.length > 0 ? this.mapLibraryCommand(rows[0]) : null;
  }

  static getLibraryCommandByPath(filePath: string): LibraryCommand | null {
    const db = getDb();
    const rows = db
      .select()
      .from(libraryCommands)
      .where(eq(libraryCommands.filePath, filePath))
      .all();
    return rows.length > 0 ? this.mapLibraryCommand(rows[0]) : null;
  }

  static createLibraryCommand(
    data: Omit<LibraryCommand, 'id' | 'createdAt' | 'updatedAt'>,
  ): LibraryCommand {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();

    db.insert(libraryCommands)
      .values({
        id,
        name: data.name,
        displayName: data.displayName,
        filePath: data.filePath,
        enabledByDefault: data.enabledByDefault ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const rows = db.select().from(libraryCommands).where(eq(libraryCommands.id, id)).all();
    return this.mapLibraryCommand(rows[0]);
  }

  static updateLibraryCommand(
    id: string,
    data: Partial<Pick<LibraryCommand, 'name' | 'displayName' | 'filePath' | 'enabledByDefault'>>,
  ): void {
    const db = getDb();
    const now = new Date().toISOString();

    db.update(libraryCommands)
      .set({
        ...data,
        updatedAt: now,
      })
      .where(eq(libraryCommands.id, id))
      .run();
  }

  static deleteLibraryCommand(id: string): void {
    const db = getDb();
    db.delete(libraryCommands).where(eq(libraryCommands.id, id)).run();
  }

  // ── Task Commands ────────────────────────────────────────

  static getTaskCommands(taskId: string): TaskCommand[] {
    const db = getDb();
    const rows = db.select().from(taskCommands).where(eq(taskCommands.taskId, taskId)).all();
    return rows.map(this.mapTaskCommand);
  }

  static setTaskCommandEnabled(taskId: string, commandId: string, enabled: boolean): void {
    const db = getDb();
    const now = new Date().toISOString();
    const id = randomUUID();

    // Use INSERT with onConflictDoUpdate for efficient upsert
    db.insert(taskCommands)
      .values({
        id,
        taskId,
        commandId,
        enabled,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [taskCommands.taskId, taskCommands.commandId],
        set: { enabled, updatedAt: now },
      })
      .run();
  }

  private static mapLibraryCommand(row: typeof libraryCommands.$inferSelect): LibraryCommand {
    return {
      id: row.id,
      name: row.name,
      displayName: row.displayName,
      filePath: row.filePath,
      enabledByDefault: row.enabledByDefault ?? true,
      createdAt: row.createdAt ?? '',
      updatedAt: row.updatedAt ?? '',
    };
  }

  private static mapTaskCommand(row: typeof taskCommands.$inferSelect): TaskCommand {
    return {
      id: row.id,
      taskId: row.taskId,
      commandId: row.commandId,
      enabled: row.enabled,
      updatedAt: row.updatedAt ?? '',
    };
  }
}

export const databaseService = DatabaseService;
