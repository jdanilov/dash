import * as fs from 'fs';
import * as path from 'path';
import type { FSWatcher } from 'fs';
import { type WebContents } from 'electron';
import type { LibraryMcp, McpConfig } from '@shared/types';
import { databaseService } from './DatabaseService';

interface McpJsonFile {
  mcpServers?: Record<string, McpConfig>;
}

interface SettingsJsonFile {
  enabledMcpjsonServers?: string[];
  [key: string]: unknown;
}

/**
 * McpLibraryService manages shared MCP server configurations.
 * - Parses .mcp.json files containing multiple server definitions
 * - Watches source files for changes
 * - Injects enabled MCPs into task directories (.mcp.json + settings.json)
 */
export class McpLibraryService {
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
   * Add MCPs from a .mcp.json source file.
   * Parses mcpServers and creates/updates DB records for each server.
   */
  static async addSource(filePath: string): Promise<{
    added: string[];
    updated: string[];
    errors: Array<{ name: string; error: string }>;
  }> {
    const result = {
      added: [] as string[],
      updated: [] as string[],
      errors: [] as Array<{ name: string; error: string }>,
    };

    // Validate file exists
    if (!fs.existsSync(filePath)) {
      result.errors.push({ name: filePath, error: 'File not found' });
      return result;
    }

    // Validate .mcp.json extension
    if (!filePath.endsWith('.mcp.json')) {
      result.errors.push({ name: filePath, error: 'File must be .mcp.json' });
      return result;
    }

    const absolutePath = path.resolve(filePath);

    try {
      const content = fs.readFileSync(absolutePath, 'utf-8');
      const parsed: McpJsonFile = JSON.parse(content);

      if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
        result.errors.push({ name: filePath, error: 'No mcpServers found in file' });
        return result;
      }

      for (const [name, config] of Object.entries(parsed.mcpServers)) {
        try {
          const existing = await databaseService.getLibraryMcpBySourceAndName(absolutePath, name);

          if (existing) {
            // Update existing
            await databaseService.updateLibraryMcp(existing.id, {
              config: JSON.stringify(config),
            });
            result.updated.push(name);
          } else {
            // Add new
            await databaseService.createLibraryMcp({
              sourceFilePath: absolutePath,
              name,
              config: JSON.stringify(config),
              enabledByDefault: true,
            });
            result.added.push(name);
          }
        } catch (error) {
          result.errors.push({
            name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Start watching this source file
      this.watchFile(absolutePath);
    } catch (error) {
      result.errors.push({
        name: filePath,
        error: `Failed to parse: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return result;
  }

  /**
   * Re-sync MCPs from a source file (after file change detected)
   */
  static async syncSource(sourceFilePath: string): Promise<void> {
    const absolutePath = path.resolve(sourceFilePath);

    if (!fs.existsSync(absolutePath)) {
      // Source file was deleted - remove all MCPs from this source
      await databaseService.deleteLibraryMcpsBySource(absolutePath);
      this.unwatchFile(absolutePath);

      if (this.webContents && !this.webContents.isDestroyed()) {
        this.webContents.send('mcp:source-removed', { sourceFilePath: absolutePath });
      }
      return;
    }

    try {
      const content = fs.readFileSync(absolutePath, 'utf-8');
      const parsed: McpJsonFile = JSON.parse(content);
      const mcpServers = parsed.mcpServers || {};

      // Get existing MCPs from this source
      const existingMcps = await databaseService.getLibraryMcpsBySource(absolutePath);
      const existingByName = new Map(existingMcps.map((m) => [m.name, m]));
      const newNames = new Set(Object.keys(mcpServers));

      // Remove MCPs that no longer exist in the file
      for (const mcp of existingMcps) {
        if (!newNames.has(mcp.name)) {
          await databaseService.deleteLibraryMcp(mcp.id);
        }
      }

      // Add or update MCPs (preserve existing enabledByDefault)
      for (const [name, config] of Object.entries(mcpServers)) {
        const existing = existingByName.get(name);
        await databaseService.upsertLibraryMcp({
          sourceFilePath: absolutePath,
          name,
          config: JSON.stringify(config),
          enabledByDefault: existing?.enabledByDefault ?? true,
        });
      }

      // Notify renderer
      if (this.webContents && !this.webContents.isDestroyed()) {
        this.webContents.send('mcp:source-changed', { sourceFilePath: absolutePath });
      }
    } catch (error) {
      console.error(`[McpLibraryService] Failed to sync source ${absolutePath}:`, error);
    }
  }

  /**
   * Remove all MCPs from a source file
   */
  static async removeSource(sourceFilePath: string): Promise<void> {
    const absolutePath = path.resolve(sourceFilePath);
    this.unwatchFile(absolutePath);
    await databaseService.deleteLibraryMcpsBySource(absolutePath);
  }

  /**
   * Get all library MCPs (sorted alphabetically)
   */
  static async getAllMcps(): Promise<LibraryMcp[]> {
    const mcps = await databaseService.getAllLibraryMcps();
    return mcps.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get unique source file paths from all MCPs
   */
  static async getSources(): Promise<string[]> {
    const mcps = await databaseService.getAllLibraryMcps();
    const sources = new Set(mcps.map((m) => m.sourceFilePath));
    return Array.from(sources).sort();
  }

  /**
   * Get MCPs for a specific task with computed enabled status.
   */
  static async getTaskMcps(taskId: string): Promise<
    Array<{
      mcp: LibraryMcp;
      enabled: boolean;
    }>
  > {
    const allMcps = await this.getAllMcps();
    const taskMcps = await databaseService.getTaskMcps(taskId);
    const taskMcpMap = new Map(taskMcps.map((tm) => [tm.mcpId, tm.enabled]));

    return allMcps.map((mcp) => ({
      mcp,
      enabled: taskMcpMap.get(mcp.id) ?? mcp.enabledByDefault,
    }));
  }

  /**
   * Toggle MCP enabled state for a task
   */
  static async toggleMcp(taskId: string, mcpId: string, enabled: boolean): Promise<void> {
    await databaseService.setTaskMcpEnabled(taskId, mcpId, enabled);

    if (this.webContents && !this.webContents.isDestroyed()) {
      this.webContents.send('mcp:toggled', { taskId });
    }
  }

  /**
   * Update MCP's enabledByDefault flag
   */
  static async updateMcpDefault(mcpId: string, enabledByDefault: boolean): Promise<void> {
    await databaseService.updateLibraryMcp(mcpId, { enabledByDefault });
  }

  /**
   * Delete a single MCP from library
   */
  static async deleteMcp(mcpId: string): Promise<void> {
    await databaseService.deleteLibraryMcp(mcpId);
  }

  /**
   * Inject enabled MCPs into task's directory.
   * 1. Merges into .mcp.json
   * 2. Updates .claude/settings.json enabledMcpjsonServers
   */
  static async injectMcps(taskId: string, cwd: string): Promise<void> {
    const taskMcps = await this.getTaskMcps(taskId);
    const enabledMcps = taskMcps.filter((tm) => tm.enabled);

    if (enabledMcps.length === 0) {
      return; // Nothing to inject
    }

    // 1. Merge into .mcp.json
    const mcpJsonPath = path.join(cwd, '.mcp.json');
    let mcpJson: McpJsonFile = { mcpServers: {} };

    if (fs.existsSync(mcpJsonPath)) {
      try {
        const content = fs.readFileSync(mcpJsonPath, 'utf-8');
        mcpJson = JSON.parse(content);
        if (!mcpJson.mcpServers) {
          mcpJson.mcpServers = {};
        }
      } catch (err) {
        console.error(`[McpLibraryService] Failed to read existing .mcp.json:`, err);
        mcpJson = { mcpServers: {} };
      }
    }

    // Merge enabled MCPs (last-write-wins for conflicts)
    for (const { mcp } of enabledMcps) {
      try {
        const config: McpConfig = JSON.parse(mcp.config);
        mcpJson.mcpServers![mcp.name] = config;
      } catch (err) {
        console.error(`[McpLibraryService] Invalid config for MCP ${mcp.name}:`, err);
      }
    }

    // Write .mcp.json
    try {
      fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpJson, null, 2));
    } catch (err) {
      throw new Error(
        `Failed to write .mcp.json: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 2. Update .claude/settings.json
    const claudeDir = path.join(cwd, '.claude');
    const settingsPath = path.join(claudeDir, 'settings.json');

    // Ensure .claude directory exists
    if (!fs.existsSync(claudeDir)) {
      try {
        fs.mkdirSync(claudeDir, { recursive: true });
      } catch (err) {
        throw new Error(
          `Failed to create .claude directory: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    let settings: SettingsJsonFile = {};
    if (fs.existsSync(settingsPath)) {
      try {
        const content = fs.readFileSync(settingsPath, 'utf-8');
        settings = JSON.parse(content);
      } catch (err) {
        console.error(`[McpLibraryService] Failed to read existing settings.json:`, err);
        settings = {};
      }
    }

    // Merge enabledMcpjsonServers
    const existingEnabled = new Set(settings.enabledMcpjsonServers || []);
    for (const { mcp } of enabledMcps) {
      existingEnabled.add(mcp.name);
    }
    settings.enabledMcpjsonServers = Array.from(existingEnabled).sort();

    // Write settings.json
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    } catch (err) {
      throw new Error(
        `Failed to write settings.json: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Start watching all MCP source files
   */
  private static async startWatching(): Promise<void> {
    const sources = await this.getSources();

    for (const source of sources) {
      this.watchFile(source);
    }
  }

  /**
   * Watch a source file for changes
   */
  private static watchFile(filePath: string): void {
    if (this.watchers.has(filePath)) {
      return;
    }

    if (!fs.existsSync(filePath)) {
      console.error(`[McpLibraryService] Cannot watch missing file: ${filePath}`);
      return;
    }

    try {
      const watcher = fs.watch(filePath, async (eventType) => {
        if (eventType === 'change') {
          console.log(`[McpLibraryService] Source file changed: ${filePath}`);
          await this.syncSource(filePath);
        } else if (eventType === 'rename') {
          console.log(`[McpLibraryService] Source file removed: ${filePath}`);
          await this.syncSource(filePath); // Will detect deletion and clean up
        }
      });

      this.watchers.set(filePath, watcher);
    } catch (err) {
      console.error(`[McpLibraryService] Failed to watch ${filePath}:`, err);
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
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    console.log('[McpLibraryService] Cleanup complete');
  }
}

export const mcpLibraryService = McpLibraryService;
