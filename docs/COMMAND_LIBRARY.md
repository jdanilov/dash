# Command Library

## Overview

Command Library enables centralized management of Claude Code commands across tasks. Store commands in a team repository, add them to Dash, and selectively enable/disable them per task. Commands are automatically injected into `.claude/commands/` when Claude spawns.

## Problem Statement

Teams need to:

- Share custom Claude commands across projects
- Enable different commands for different tasks (e.g., exploratory vs production work)
- Maintain commands in version control
- Sync command changes across team members
- Avoid manually copying command files to each worktree

## Architecture

### Core Components

**Backend Services:**

- `CommandLibraryService` - File watching, command injection, lifecycle management
- `DatabaseService` - CRUD operations for commands and task associations
- `commandLibraryIpc` - IPC bridge for renderer communication

**Database Schema:**

```sql
library_commands (id, name, displayName, filePath, enabledByDefault, timestamps)
task_commands (id, taskId, commandId, enabled, updatedAt)
```

**Frontend Components:**

- `LibraryPanel` - Main UI, command list, add/toggle/delete operations
- `CommandItem` - Individual command row with toggle, star, edit, delete actions

### Data Flow

```
1. User adds command → File picker → IPC → Service validates → DB insert → Start watching
2. User toggles command → IPC → Update task_commands → Mark needs restart
3. File changes → fs.watch → Notify renderer → Show restart prompt
4. Task starts → ptyManager calls injectCommands → Copy enabled commands to .claude/commands/
5. Claude spawns → Discovers commands from .claude/commands/
```

## Implementation Details

### Command Addition

```typescript
// Deduplication by file path
const existing = await db.getLibraryCommandByPath(absolutePath);
if (existing) {
  await db.updateLibraryCommand(existing.id, { name, displayName, filePath });
} else {
  await db.createLibraryCommand({ name, displayName, filePath, enabledByDefault: true });
  startWatching(filePath);
}
```

### Command Injection

```typescript
// In ptyManager.ts → startDirectPty()
if (options.taskId) {
  await commandLibraryService.injectCommands(options.taskId, options.cwd);
}
writeHookSettings(options.cwd, options.id);
// Spawn Claude CLI...
```

### File Watching

```typescript
// Watch all library command files
for (const command of commands) {
  fs.watch(command.filePath, (eventType) => {
    if (eventType === 'change') {
      webContents.send('library:command-file-changed', { commandId: command.id });
    }
  });
}
```

### Per-Task Enablement

```typescript
// Task-specific state overrides command default
const isEnabled = (commandId: string): boolean => {
  const taskState = taskCommands.get(commandId);
  if (taskState !== undefined) return taskState;

  const command = commands.find((c) => c.id === commandId);
  return command?.enabledByDefault ?? true;
};
```

## User Workflows

### Setup (One-Time)

1. Clone team resources repo: `git clone git@github.com:team/claude-resources.git`
2. Open Dash → Library panel → Click [+]
3. Select command files (e.g., `-commit.md`, `-deep-search.md`)
4. Commands appear in Library, enabled by default

### Per-Task Configuration

1. Select task in sidebar
2. In Library panel, click commands to toggle ON/OFF
3. Star icon = toggle "enabled by default" for new tasks
4. Click restart when prompted

### Editing Commands

1. Click pencil icon → Opens in external editor
2. Edit and save
3. Dash detects change → Shows restart prompt
4. Click restart → Re-injects commands → Spawns new Claude session

### Sharing with Team

```bash
# Team repo structure
claude-resources/
  commands/
    -commit.md
    -review-pr.md
    -deep-search.md
    -test.md

# Each dev:
git pull origin main  # Get latest commands
# Dash watches files, auto-detects changes
```

## Naming Convention

Commands use `-` prefix for easy gitignoring:

```gitignore
# .gitignore
.claude/commands/-*
```

Command file `-commit.md` → Display as `/-commit` → CLI slash command

## Database Migration

```sql
CREATE TABLE library_commands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  enabled_by_default INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE task_commands (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL REFERENCES library_commands(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, command_id)
);
```

## IPC API

```typescript
window.electronAPI.commandLibrary = {
  addCommands(filePaths?: string[]): Promise<{ added, updated, errors }>,
  getAll(): Promise<LibraryCommand[]>,
  getTaskCommands(taskId): Promise<Array<{ command, enabled }>>,
  toggleCommand({ taskId, commandId, enabled }): Promise<void>,
  updateDefault({ commandId, enabledByDefault }): Promise<void>,
  deleteCommand(commandId): Promise<void>,
  reinjectCommands({ taskId, cwd }): Promise<void>,
  openInEditor(filePath): Promise<void>,
};

// Events
onLibraryCommandsChanged({ taskId }) // Command toggled for task
onLibraryCommandFileChanged({ commandId }) // File edited externally
onLibraryCommandRemoved({ commandId }) // Command deleted
```

## UI Components

**LibraryPanel** (`src/renderer/components/library/LibraryPanel.tsx`)

- Located in right panel below FileChangesPanel
- Vertical split with resize handle (60/40 default)
- Shows commands for active task only
- Manages state: commands, taskCommands, needsRestart, loading

**CommandItem** (`src/renderer/components/library/CommandItem.tsx`)

- Circle indicator: filled = enabled, empty = disabled
- Click row = toggle enabled for task
- Star (⭐) = toggle enabledByDefault (amber when true)
- Pencil (✏️) = open in external editor
- Trash (🗑️) = delete with confirmation
- Actions visible on hover

## Future Enhancements

### Planned

- **Skills, MCPs, Hooks** - Extend to all Claude Code resources (Phase 3-5)
- **Resource Templates** - Starter library with common commands
- **Validation** - Parse YAML frontmatter, validate command format
- **Usage Analytics** - Track which commands are used most
- **Bulk Operations** - Enable/disable multiple commands at once
- **Search/Filter** - Search commands by name, filter by type
- **Import/Export** - Share command configurations as JSON

### Technical Debt

- Add proper error toasts (currently console.error)
- Handle file renames/moves (currently just stops watching)
- Add command preview modal
- Optimize re-renders in LibraryPanel
- Add loading states for async operations
- Test coverage for CommandLibraryService

## Files Modified/Created

### Created

- `src/main/services/CommandLibraryService.ts` (303 lines)
- `src/main/ipc/commandLibraryIpc.ts` (110 lines)
- `src/renderer/components/library/LibraryPanel.tsx` (275 lines)
- `src/renderer/components/library/CommandItem.tsx` (99 lines)

### Modified

- `src/main/db/schema.ts` - Added tables
- `src/main/db/migrate.ts` - Added migrations
- `src/main/services/DatabaseService.ts` - Added CRUD methods (+142 lines)
- `src/main/services/ptyManager.ts` - Inject commands before spawn
- `src/main/ipc/index.ts` - Register commandLibraryIpc
- `src/main/main.ts` - Initialize service, cleanup on quit
- `src/main/preload.ts` - Expose IPC API
- `src/types/electron-api.d.ts` - Add type definitions
- `src/shared/types.ts` - Add LibraryCommand, TaskCommand types
- `src/renderer/App.tsx` - Integrate LibraryPanel in right panel

## References

- **Claude Code Commands**: `.claude/commands/*.md` files
- **File Watching**: Node.js `fs.watch()` API
- **External Editor**: Electron `shell.openPath()` API
- **Database**: SQLite with Drizzle ORM
- **IPC**: Electron `ipcMain.handle()` / `ipcRenderer.invoke()`
