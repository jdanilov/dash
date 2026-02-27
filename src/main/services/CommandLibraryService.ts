import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { FSWatcher } from 'fs';
import { type WebContents } from 'electron';
import type { LibraryCommand, TaskCommand } from '@shared/types';
import { databaseService } from './DatabaseService';

/**
 * CommandLibraryService manages shared command resources.
 * - Adds commands from external files
 * - Watches command files for changes
 * - Injects enabled commands into task directories
 */
export class CommandLibraryService {
  private static watchers = new Map<string, FSWatcher>();
  private static webContents: WebContents | null = null;

  /**
   * Initialize the service with renderer WebContents for notifications
   */
  static initialize(webContents: WebContents): void {
    this.webContents = webContents;
    this.startWatching();
  }

  /**
   * Add commands from file paths (deduped by path, overrides if exists)
   */
  static async addCommands(filePaths: string[]): Promise<{
    added: number;
    updated: number;
    errors: Array<{ path: string; error: string }>;
  }> {
    const result = { added: 0, updated: 0, errors: [] as Array<{ path: string; error: string }> };

    for (const filePath of filePaths) {
      try {
        // Validate file exists
        if (!fs.existsSync(filePath)) {
          result.errors.push({ path: filePath, error: 'File not found' });
          continue;
        }

        // Validate file extension
        if (!filePath.endsWith('.md')) {
          result.errors.push({ path: filePath, error: 'Only .md files are supported' });
          continue;
        }

        // Extract command name from filename (e.g., "-commit.md" -> "-commit")
        const fileName = path.basename(filePath, '.md');
        if (!fileName.startsWith('-')) {
          result.errors.push({
            path: filePath,
            error: 'Command files must start with "-" (e.g., -commit.md)',
          });
          continue;
        }

        const displayName = `/${fileName}`;
        const absolutePath = path.resolve(filePath);

        // Check if command already exists at this path
        const existing = await databaseService.getLibraryCommandByPath(absolutePath);

        if (existing) {
          // Update existing
          await databaseService.updateLibraryCommand(existing.id, {
            name: fileName,
            displayName,
            filePath: absolutePath,
          });
          result.updated++;
        } else {
          // Add new
          await databaseService.createLibraryCommand({
            name: fileName,
            displayName,
            filePath: absolutePath,
            enabledByDefault: true,
          });
          result.added++;

          // Start watching new file
          this.watchFile(absolutePath);
        }
      } catch (error) {
        result.errors.push({
          path: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Get all library commands (sorted alphabetically)
   */
  static async getAllCommands(): Promise<LibraryCommand[]> {
    const commands = await databaseService.getAllLibraryCommands();
    return commands.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get commands for a specific task with enabled status
   */
  static async getTaskCommands(taskId: string): Promise<
    Array<{
      command: LibraryCommand;
      enabled: boolean;
    }>
  > {
    const allCommands = await this.getAllCommands();
    const taskCommands = await databaseService.getTaskCommands(taskId);
    const taskCommandMap = new Map(taskCommands.map((tc) => [tc.commandId, tc.enabled]));

    return allCommands.map((command) => ({
      command,
      enabled: taskCommandMap.get(command.id) ?? command.enabledByDefault,
    }));
  }

  /**
   * Toggle command enabled state for a task
   */
  static async toggleCommand(taskId: string, commandId: string, enabled: boolean): Promise<void> {
    await databaseService.setTaskCommandEnabled(taskId, commandId, enabled);

    // Notify renderer that commands changed for this task
    if (this.webContents && !this.webContents.isDestroyed()) {
      this.webContents.send('library:commands-changed', { taskId });
    }
  }

  /**
   * Update command's enabledByDefault flag
   */
  static async updateCommandDefault(commandId: string, enabledByDefault: boolean): Promise<void> {
    await databaseService.updateLibraryCommand(commandId, { enabledByDefault });
  }

  /**
   * Delete a command from library (cascades to task_commands)
   */
  static async deleteCommand(commandId: string): Promise<void> {
    const command = await databaseService.getLibraryCommand(commandId);
    if (command) {
      // Stop watching file
      this.unwatchFile(command.filePath);
    }

    await databaseService.deleteLibraryCommand(commandId);
  }

  /**
   * Inject enabled commands into task's .claude/commands/ directory
   */
  static async injectCommands(taskId: string, cwd: string): Promise<void> {
    const taskCommands = await this.getTaskCommands(taskId);
    const enabledCommands = taskCommands.filter((tc) => tc.enabled);

    const commandsDir = path.join(cwd, '.claude', 'commands');

    // Ensure .claude/commands directory exists
    if (!fs.existsSync(commandsDir)) {
      fs.mkdirSync(commandsDir, { recursive: true });
    }

    // Clean up existing dash-managed commands (those starting with -)
    const existingFiles = fs.readdirSync(commandsDir);
    for (const file of existingFiles) {
      if (file.startsWith('-') && file.endsWith('.md')) {
        const filePath = path.join(commandsDir, file);
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error(`[CommandLibraryService] Failed to remove ${filePath}:`, err);
        }
      }
    }

    // Copy enabled commands
    for (const { command } of enabledCommands) {
      try {
        if (!fs.existsSync(command.filePath)) {
          console.error(`[CommandLibraryService] Source file not found: ${command.filePath}`);
          continue;
        }

        const destPath = path.join(commandsDir, `${command.name}.md`);
        fs.copyFileSync(command.filePath, destPath);
      } catch (err) {
        console.error(`[CommandLibraryService] Failed to copy ${command.name}:`, err);
      }
    }

    console.error(
      `[CommandLibraryService] Injected ${enabledCommands.length} commands to ${commandsDir}`,
    );
  }

  /**
   * Start watching all library command files
   */
  private static async startWatching(): Promise<void> {
    const commands = await databaseService.getAllLibraryCommands();

    for (const command of commands) {
      this.watchFile(command.filePath);
    }

    console.error(`[CommandLibraryService] Watching ${commands.length} command files`);
  }

  /**
   * Watch a single command file for changes
   */
  private static watchFile(filePath: string): void {
    // Avoid duplicate watchers
    if (this.watchers.has(filePath)) {
      return;
    }

    if (!fs.existsSync(filePath)) {
      console.error(`[CommandLibraryService] Cannot watch missing file: ${filePath}`);
      return;
    }

    try {
      const watcher = fs.watch(filePath, async (eventType) => {
        if (eventType === 'change') {
          console.error(`[CommandLibraryService] File changed: ${filePath}`);

          // Get command by path
          const command = await databaseService.getLibraryCommandByPath(filePath);
          if (command) {
            // Notify renderer
            if (this.webContents && !this.webContents.isDestroyed()) {
              this.webContents.send('library:command-file-changed', { commandId: command.id });
            }
          }
        } else if (eventType === 'rename') {
          // File was deleted or moved
          console.error(`[CommandLibraryService] File removed: ${filePath}`);
          this.unwatchFile(filePath);

          // Optionally remove from library
          const command = await databaseService.getLibraryCommandByPath(filePath);
          if (command) {
            await this.deleteCommand(command.id);
            if (this.webContents && !this.webContents.isDestroyed()) {
              this.webContents.send('library:command-removed', { commandId: command.id });
            }
          }
        }
      });

      this.watchers.set(filePath, watcher);
    } catch (err) {
      console.error(`[CommandLibraryService] Failed to watch ${filePath}:`, err);
    }
  }

  /**
   * Stop watching a file
   */
  private static unwatchFile(filePath: string): void {
    const watcher = this.watchers.get(filePath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(filePath);
    }
  }

  /**
   * Clean up all watchers
   */
  static cleanup(): void {
    for (const [filePath, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
    console.error('[CommandLibraryService] Cleanup complete');
  }
}

export const commandLibraryService = CommandLibraryService;
