# MCP Library

## Overview

MCP Library enables centralized management of MCP (Model Context Protocol) servers across tasks. Point to a team `.mcp.json` file, and Dash parses, stores, and injects the servers into each task's worktree when Claude spawns.

## Architecture

### Data Model

```sql
-- MCPs with source file path (duplicated per server for simplicity)
library_mcps (
  id TEXT PRIMARY KEY,
  source_file_path TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL,  -- JSON: { command, args, env? }
  enabled_by_default INTEGER DEFAULT 1,
  created_at, updated_at,
  UNIQUE(source_file_path, name)
)

-- Per-task enablement
task_mcps (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  mcp_id TEXT REFERENCES library_mcps(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL,
  updated_at,
  UNIQUE(task_id, mcp_id)
)
```

### Key Decisions

| Decision       | Choice            | Rationale                                  |
| -------------- | ----------------- | ------------------------------------------ |
| Name conflicts | Last-write-wins   | Simple, user can re-order if needed        |
| Cleanup        | Leave in worktree | Matches command behavior, simpler          |
| UI layout      | Flat list         | Consistent with commands/skills            |
| Data model     | Single table      | sourceFilePath duplicated but avoids joins |

### Data Flow

```
1. User clicks [+ Add MCP] → File picker → selects .mcp.json
2. Service parses mcpServers object → creates MCP records in DB
3. UI shows flat list of MCPs with source path subtitle
4. User toggles MCP → task_mcps updated → needs restart flag
5. Task starts → ptyManager calls injectMcps() before spawn
   └─ Merges into {cwd}/.mcp.json
   └─ Updates {cwd}/.claude/settings.json enabledMcpjsonServers
6. Source file changes → fs.watch → re-parse → update MCPs → notify UI
```

## Implementation

### MCP Injection

```typescript
async injectMcps(taskId: string, cwd: string): Promise<void> {
  const enabledMcps = await this.getEnabledMcpsForTask(taskId);

  // 1. Merge into .mcp.json
  const mcpJsonPath = path.join(cwd, '.mcp.json');
  const existing = await this.readMcpJson(mcpJsonPath);

  for (const mcp of enabledMcps) {
    existing.mcpServers[mcp.name] = JSON.parse(mcp.config);
  }

  await fs.writeFile(mcpJsonPath, JSON.stringify(existing, null, 2));

  // 2. Update settings.json
  const settingsPath = path.join(cwd, '.claude', 'settings.json');
  const settings = await this.readSettings(settingsPath);

  settings.enabledMcpjsonServers = [
    ...new Set([
      ...(settings.enabledMcpjsonServers || []),
      ...enabledMcps.map(m => m.name)
    ])
  ];

  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
}
```

### Source Parsing

```typescript
async addSource(filePath: string): Promise<{ added: string[], errors: string[] }> {
  const content = await fs.readFile(filePath, 'utf-8');
  const parsed = JSON.parse(content);
  const added: string[] = [];
  const errors: string[] = [];

  for (const [name, config] of Object.entries(parsed.mcpServers || {})) {
    try {
      await db.upsertLibraryMcp({
        sourceFilePath: filePath,
        name,
        config: JSON.stringify(config),
        enabledByDefault: true,
      });
      added.push(name);
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }

  this.startWatching(filePath);
  return { added, errors };
}
```

### File Watching

```typescript
startWatching(filePath: string): void {
  if (this.watchers.has(filePath)) return;

  const watcher = fs.watch(filePath, async (eventType) => {
    if (eventType === 'change') {
      // Re-parse and update MCPs
      await this.syncSource(filePath);
      // Notify renderer
      webContents.send('mcp:source-changed', { filePath });
    }
  });

  this.watchers.set(filePath, watcher);
}
```

## IPC API

```typescript
window.electronAPI.mcpLibrary = {
  addSource(filePath?: string): Promise<{ added: string[], errors: string[] }>,
  getAll(): Promise<LibraryMcp[]>,
  getTaskMcps(taskId): Promise<Array<{ mcp: LibraryMcp, enabled: boolean }>>,
  toggleMcp({ taskId, mcpId, enabled }): Promise<void>,
  updateDefault({ mcpId, enabledByDefault }): Promise<void>,
  removeSource(sourceFilePath): Promise<void>,
  removeMcp(mcpId): Promise<void>,
  reinjectMcps({ taskId, cwd }): Promise<void>,
};

// Events
onMcpSourceChanged({ filePath })
onMcpToggled({ taskId })
```

## UI

**McpItem component:**

- Circle indicator: filled = enabled, empty = disabled
- Display: `browsermcp` with `/path/to/.mcp.json` subtitle
- Click row = toggle enabled for task
- Star = toggle enabledByDefault
- Trash = delete (removes from DB, not from source file)

**LibraryPanel integration:**

- MCPs shown below commands in flat list
- Same toggle/star/delete pattern
- [+ Add MCP] button opens file picker for .mcp.json

## Files

### Created

- `src/main/services/McpLibraryService.ts` (~330 lines) - Core service
- `src/main/ipc/mcpLibraryIpc.ts` (~130 lines) - IPC handlers
- `src/renderer/components/library/McpItem.tsx` (~100 lines) - UI component

### Modified

- `src/main/db/schema.ts` - Added `libraryMcps` and `taskMcps` tables
- `src/main/db/migrate.ts` - Added migration SQL
- `src/main/services/DatabaseService.ts` - Added ~100 lines of CRUD methods
- `src/main/services/ptyManager.ts` - Call `injectMcps()` before Claude spawn
- `src/main/ipc/index.ts` - Register mcpLibraryIpc
- `src/main/preload.ts` - Expose `mcpLibrary` API
- `src/main/main.ts` - Initialize/cleanup McpLibraryService
- `src/types/electron-api.d.ts` - Added `LibraryMcp` and MCP API types
- `src/shared/types.ts` - Added `LibraryMcp`, `TaskMcp`, `McpConfig` types
- `src/renderer/components/library/LibraryPanel.tsx` - Integrated MCP list and add dropdown
