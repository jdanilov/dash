import * as fs from 'fs';
import * as path from 'path';
import type { FSWatcher } from 'fs';
import { type WebContents } from 'electron';
import type { LibraryCommand, TaskCommand } from '@shared/types';
import { databaseService } from './DatabaseService';

/**
 * CommandLibraryService manages shared command and skill resources.
 * - Adds commands (single .md files) and skills (directories with SKILL.md)
 * - Supports bulk import from .claude directories
 * - Watches resource files for changes
 * - Injects enabled resources into task directories
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
   * Add commands and skills from file/directory paths (deduped by path, overrides if exists)
   * Supports:
   * - Single .md files (commands)
   * - Directories containing SKILL.md (skills)
   * - .claude directories (bulk import: commands/*.md + skills/*)
   */
  static async addCommands(filePaths: string[]): Promise<{
    added: number;
    updated: number;
    errors: Array<{ path: string; error: string }>;
  }> {
    const result = { added: 0, updated: 0, errors: [] as Array<{ path: string; error: string }> };

    for (const filePath of filePaths) {
      try {
        const processResult = await this.processPath(filePath);
        result.added += processResult.added;
        result.updated += processResult.updated;
        result.errors.push(...processResult.errors);
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
   * Process a single path (file or directory)
   */
  private static async processPath(filePath: string): Promise<{
    added: number;
    updated: number;
    errors: Array<{ path: string; error: string }>;
  }> {
    const result = { added: 0, updated: 0, errors: [] as Array<{ path: string; error: string }> };

    // Validate path exists
    if (!fs.existsSync(filePath)) {
      result.errors.push({ path: filePath, error: 'Path not found' });
      return result;
    }

    const stats = fs.statSync(filePath);

    if (stats.isFile()) {
      // Single file - must be .md (command)
      if (!filePath.endsWith('.md')) {
        result.errors.push({ path: filePath, error: 'Only .md files are supported' });
        return result;
      }

      const addResult = await this.addCommand(filePath);
      if (addResult.success) {
        if (addResult.updated) result.updated++;
        else result.added++;
      } else {
        result.errors.push({ path: filePath, error: addResult.error || 'Unknown error' });
      }
    } else if (stats.isDirectory()) {
      // Directory - check if it's a skill, .claude directory, or commands/skills directory
      const skillMdPath = path.join(filePath, 'SKILL.md');
      const skillMdPathLower = path.join(filePath, 'skill.md');
      const claudeCommandsDir = path.join(filePath, 'commands');
      const claudeSkillsDir = path.join(filePath, 'skills');
      const dirName = path.basename(filePath);

      if (fs.existsSync(skillMdPath) || fs.existsSync(skillMdPathLower)) {
        // It's a skill directory
        const addResult = await this.addSkill(filePath);
        if (addResult.success) {
          if (addResult.updated) result.updated++;
          else result.added++;
        } else {
          result.errors.push({ path: filePath, error: addResult.error || 'Unknown error' });
        }
      } else if (fs.existsSync(claudeCommandsDir) || fs.existsSync(claudeSkillsDir)) {
        // It's a .claude directory - bulk import
        const bulkResult = await this.bulkImportClaudeDir(filePath);
        result.added += bulkResult.added;
        result.updated += bulkResult.updated;
        result.errors.push(...bulkResult.errors);
      } else if (dirName === 'commands') {
        // Direct commands directory - import all .md files
        const bulkResult = await this.bulkImportCommandsDir(filePath);
        result.added += bulkResult.added;
        result.updated += bulkResult.updated;
        result.errors.push(...bulkResult.errors);
      } else if (dirName === 'skills') {
        // Direct skills directory - import all skill subdirectories
        const bulkResult = await this.bulkImportSkillsDir(filePath);
        result.added += bulkResult.added;
        result.updated += bulkResult.updated;
        result.errors.push(...bulkResult.errors);
      } else {
        result.errors.push({
          path: filePath,
          error:
            'Directory must contain SKILL.md (for skills) or commands/skills subdirectories (for bulk import)',
        });
      }
    }

    return result;
  }

  /**
   * Add a single command from .md file
   */
  private static async addCommand(
    filePath: string,
  ): Promise<{ success: boolean; updated: boolean; error?: string }> {
    try {
      const fileName = path.basename(filePath, '.md');
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
          type: 'command',
        });
        return { success: true, updated: true };
      } else {
        // Add new
        await databaseService.createLibraryCommand({
          name: fileName,
          displayName,
          filePath: absolutePath,
          type: 'command',
          enabledByDefault: true,
        });

        // Start watching new file
        this.watchFile(absolutePath);
        return { success: true, updated: false };
      }
    } catch (error) {
      return {
        success: false,
        updated: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Add a skill from directory containing SKILL.md
   */
  private static async addSkill(
    skillDir: string,
  ): Promise<{ success: boolean; updated: boolean; error?: string }> {
    try {
      const skillName = path.basename(skillDir);
      const displayName = skillName; // No slash for skills
      const absolutePath = path.resolve(skillDir);

      // Check if skill already exists at this path
      const existing = await databaseService.getLibraryCommandByPath(absolutePath);

      if (existing) {
        // Update existing
        await databaseService.updateLibraryCommand(existing.id, {
          name: skillName,
          displayName,
          filePath: absolutePath,
          type: 'skill',
        });
        return { success: true, updated: true };
      } else {
        // Add new
        await databaseService.createLibraryCommand({
          name: skillName,
          displayName,
          filePath: absolutePath,
          type: 'skill',
          enabledByDefault: true,
        });

        // Start watching skill directory
        this.watchFile(absolutePath);
        return { success: true, updated: false };
      }
    } catch (error) {
      return {
        success: false,
        updated: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Bulk import from .claude directory
   * Scans commands/*.md and skills/* directories
   */
  private static async bulkImportClaudeDir(claudeDir: string): Promise<{
    added: number;
    updated: number;
    errors: Array<{ path: string; error: string }>;
  }> {
    const result = { added: 0, updated: 0, errors: [] as Array<{ path: string; error: string }> };

    // Import commands from commands/
    const commandsDir = path.join(claudeDir, 'commands');
    if (fs.existsSync(commandsDir)) {
      try {
        const files = fs.readdirSync(commandsDir);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const filePath = path.join(commandsDir, file);
            const addResult = await this.addCommand(filePath);
            if (addResult.success) {
              if (addResult.updated) result.updated++;
              else result.added++;
            } else {
              result.errors.push({ path: filePath, error: addResult.error || 'Unknown error' });
            }
          }
        }
      } catch (error) {
        result.errors.push({
          path: commandsDir,
          error: `Failed to scan commands: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    // Import skills from skills/
    const skillsDir = path.join(claudeDir, 'skills');
    if (fs.existsSync(skillsDir)) {
      try {
        const dirs = fs.readdirSync(skillsDir);
        for (const dir of dirs) {
          const skillDirPath = path.join(skillsDir, dir);
          const stats = fs.statSync(skillDirPath);

          if (stats.isDirectory()) {
            const skillMdPath = path.join(skillDirPath, 'SKILL.md');
            const skillMdPathLower = path.join(skillDirPath, 'skill.md');

            if (fs.existsSync(skillMdPath) || fs.existsSync(skillMdPathLower)) {
              const addResult = await this.addSkill(skillDirPath);
              if (addResult.success) {
                if (addResult.updated) result.updated++;
                else result.added++;
              } else {
                result.errors.push({
                  path: skillDirPath,
                  error: addResult.error || 'Unknown error',
                });
              }
            }
          }
        }
      } catch (error) {
        result.errors.push({
          path: skillsDir,
          error: `Failed to scan skills: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    return result;
  }

  /**
   * Bulk import from a commands directory
   * Scans all .md files in the directory
   */
  private static async bulkImportCommandsDir(commandsDir: string): Promise<{
    added: number;
    updated: number;
    errors: Array<{ path: string; error: string }>;
  }> {
    const result = { added: 0, updated: 0, errors: [] as Array<{ path: string; error: string }> };

    try {
      const files = fs.readdirSync(commandsDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(commandsDir, file);
          const addResult = await this.addCommand(filePath);
          if (addResult.success) {
            if (addResult.updated) result.updated++;
            else result.added++;
          } else {
            result.errors.push({ path: filePath, error: addResult.error || 'Unknown error' });
          }
        }
      }
    } catch (error) {
      result.errors.push({
        path: commandsDir,
        error: `Failed to scan commands: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return result;
  }

  /**
   * Bulk import from a skills directory
   * Scans all subdirectories containing SKILL.md
   */
  private static async bulkImportSkillsDir(skillsDir: string): Promise<{
    added: number;
    updated: number;
    errors: Array<{ path: string; error: string }>;
  }> {
    const result = { added: 0, updated: 0, errors: [] as Array<{ path: string; error: string }> };

    try {
      const dirs = fs.readdirSync(skillsDir);
      for (const dir of dirs) {
        const skillDirPath = path.join(skillsDir, dir);
        const stats = fs.statSync(skillDirPath);

        if (stats.isDirectory()) {
          const skillMdPath = path.join(skillDirPath, 'SKILL.md');
          const skillMdPathLower = path.join(skillDirPath, 'skill.md');

          if (fs.existsSync(skillMdPath) || fs.existsSync(skillMdPathLower)) {
            const addResult = await this.addSkill(skillDirPath);
            if (addResult.success) {
              if (addResult.updated) result.updated++;
              else result.added++;
            } else {
              result.errors.push({
                path: skillDirPath,
                error: addResult.error || 'Unknown error',
              });
            }
          }
        }
      }
    } catch (error) {
      result.errors.push({
        path: skillsDir,
        error: `Failed to scan skills: ${error instanceof Error ? error.message : String(error)}`,
      });
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
   * Get commands for a specific task with computed enabled status.
   *
   * Enabled state priority:
   * 1. If task has an explicit override (in task_commands table), use that
   * 2. Otherwise, use command's enabledByDefault setting
   *
   * This allows users to:
   * - Set global defaults (enabledByDefault) for all new tasks
   * - Override on a per-task basis for specific needs
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
   * Inject enabled commands and skills into task's .claude/ directory.
   * Commands go to .claude/commands/, skills go to .claude/skills/
   * Throws errors instead of silently failing to ensure PTY startup is aware of issues.
   */
  static async injectCommands(taskId: string, cwd: string): Promise<void> {
    console.error(`[CommandLibraryService] Injecting resources for task ${taskId} in ${cwd}`);

    const taskCommands = await this.getTaskCommands(taskId);
    const enabledResources = taskCommands.filter((tc) => tc.enabled);
    const enabledCommands = enabledResources.filter((tc) => tc.command.type === 'command');
    const enabledSkills = enabledResources.filter((tc) => tc.command.type === 'skill');

    console.error(
      `[CommandLibraryService] Found ${enabledCommands.length} commands and ${enabledSkills.length} skills out of ${taskCommands.length} total`,
    );

    const commandsDir = path.join(cwd, '.claude', 'commands');
    const skillsDir = path.join(cwd, '.claude', 'skills');

    // Ensure .claude/commands directory exists
    if (!fs.existsSync(commandsDir)) {
      console.error(`[CommandLibraryService] Creating directory: ${commandsDir}`);
      try {
        fs.mkdirSync(commandsDir, { recursive: true });
      } catch (err) {
        throw new Error(
          `Failed to create commands directory: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Ensure .claude/skills directory exists
    if (!fs.existsSync(skillsDir)) {
      console.error(`[CommandLibraryService] Creating directory: ${skillsDir}`);
      try {
        fs.mkdirSync(skillsDir, { recursive: true });
      } catch (err) {
        throw new Error(
          `Failed to create skills directory: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Clean up existing library-managed commands
    try {
      const existingFiles = fs.readdirSync(commandsDir);
      const libraryCommandNames = new Set(
        taskCommands.filter((tc) => tc.command.type === 'command').map((tc) => tc.command.name),
      );

      for (const file of existingFiles) {
        if (file.endsWith('.md')) {
          const baseName = path.basename(file, '.md');
          if (libraryCommandNames.has(baseName)) {
            const filePath = path.join(commandsDir, file);
            try {
              fs.unlinkSync(filePath);
            } catch (err) {
              console.error(`[CommandLibraryService] Failed to remove ${filePath}:`, err);
            }
          }
        }
      }
    } catch (err) {
      throw new Error(
        `Failed to clean up commands directory: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Clean up existing library-managed skills
    try {
      const existingDirs = fs.readdirSync(skillsDir);
      const librarySkillNames = new Set(
        taskCommands.filter((tc) => tc.command.type === 'skill').map((tc) => tc.command.name),
      );

      for (const dir of existingDirs) {
        const skillPath = path.join(skillsDir, dir);
        const stats = fs.statSync(skillPath);
        if (stats.isDirectory() && librarySkillNames.has(dir)) {
          try {
            fs.rmSync(skillPath, { recursive: true, force: true });
          } catch (err) {
            console.error(`[CommandLibraryService] Failed to remove ${skillPath}:`, err);
          }
        }
      }
    } catch (err) {
      // Skills directory might not exist yet, that's okay
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(
          `Failed to clean up skills directory: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Copy enabled commands
    const errors: string[] = [];
    for (const { command } of enabledCommands) {
      try {
        if (!fs.existsSync(command.filePath)) {
          const errorMsg = `Source file not found: ${command.filePath}`;
          console.error(`[CommandLibraryService] ${errorMsg}`);
          errors.push(errorMsg);
          continue;
        }

        const commandName = command.name.endsWith('.md') ? command.name.slice(0, -3) : command.name;
        const destPath = path.join(commandsDir, `${commandName}.md`);
        fs.copyFileSync(command.filePath, destPath);
      } catch (err) {
        const errorMsg = `Failed to copy command ${command.name}: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[CommandLibraryService] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // Copy enabled skills (entire directories)
    for (const { command } of enabledSkills) {
      try {
        if (!fs.existsSync(command.filePath)) {
          const errorMsg = `Source directory not found: ${command.filePath}`;
          console.error(`[CommandLibraryService] ${errorMsg}`);
          errors.push(errorMsg);
          continue;
        }

        const destPath = path.join(skillsDir, command.name);
        this.copyDirectory(command.filePath, destPath);
      } catch (err) {
        const errorMsg = `Failed to copy skill ${command.name}: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[CommandLibraryService] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Resource injection had ${errors.length} error(s): ${errors.join('; ')}`);
    }

    console.error(
      `[CommandLibraryService] Injected ${enabledCommands.length} commands and ${enabledSkills.length} skills`,
    );
  }

  /**
   * Recursively copy a directory with safety limits
   */
  private static copyDirectory(src: string, dest: string, depth = 0): void {
    const MAX_DEPTH = 10;
    if (depth > MAX_DEPTH) {
      throw new Error(`Directory nesting too deep (max ${MAX_DEPTH} levels)`);
    }

    // Skip unwanted directories at any level
    const basename = path.basename(src);
    const skipDirs = ['.git', 'node_modules', '.DS_Store', '__pycache__', '.venv'];
    if (skipDirs.includes(basename)) {
      return;
    }

    // Create destination directory
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files and unwanted patterns at root level only
      if (depth === 0 && entry.name.startsWith('.') && entry.name !== '.env') {
        continue;
      }

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      // Skip symlinks to prevent loops
      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath, depth + 1);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
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
   * Watch a single command file for changes.
   *
   * Note: When a command file changes, we notify the UI but don't automatically
   * re-inject into running tasks. Users must manually restart their session to
   * pick up the changes. This is intentional to avoid disrupting active work.
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
            // Notify renderer to show restart prompt
            // Note: The actual file content is not updated in the database or re-injected
            // until the user restarts their session. This prevents mid-session disruption.
            if (this.webContents && !this.webContents.isDestroyed()) {
              this.webContents.send('library:command-file-changed', { commandId: command.id });
            }
          }
        } else if (eventType === 'rename') {
          // File was deleted or moved
          console.error(`[CommandLibraryService] File removed: ${filePath}`);
          this.unwatchFile(filePath);

          // Remove from library since the source file is gone
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
