import { useState, useEffect } from 'react';
import { Plus, Library } from 'lucide-react';
import { CommandItem } from './CommandItem';
import type { LibraryCommand } from '@shared/types';

interface LibraryPanelProps {
  currentTaskId: string | null;
  taskPath: string | null;
}

export function LibraryPanel({ currentTaskId, taskPath }: LibraryPanelProps) {
  const [commands, setCommands] = useState<LibraryCommand[]>([]);
  const [taskCommands, setTaskCommands] = useState<Map<string, boolean>>(new Map());
  const [needsRestart, setNeedsRestart] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load all library commands
  const loadCommands = async () => {
    const result = await window.electronAPI.commandLibrary.getAll();
    if (result.success && result.data) {
      setCommands(result.data);
    }
  };

  // Load task-specific command states
  const loadTaskCommands = async () => {
    if (!currentTaskId) {
      setTaskCommands(new Map());
      return;
    }

    const result = await window.electronAPI.commandLibrary.getTaskCommands(currentTaskId);
    if (result.success && result.data) {
      const map = new Map<string, boolean>();
      result.data.forEach((tc) => {
        map.set(tc.command.id, tc.enabled);
      });
      setTaskCommands(map);
    }
  };

  // Initial load
  useEffect(() => {
    loadCommands();
  }, []);

  // Reload task commands when task changes
  useEffect(() => {
    loadTaskCommands();
    setNeedsRestart(false);
  }, [currentTaskId]);

  // Listen for command changes
  useEffect(() => {
    const unsubCommands = window.electronAPI.onLibraryCommandsChanged((data) => {
      if (data.taskId === currentTaskId) {
        setNeedsRestart(true);
      }
    });

    const unsubFileChanged = window.electronAPI.onLibraryCommandFileChanged((data) => {
      // Check if this command is enabled for current task
      const enabled = taskCommands.get(data.commandId);
      if (enabled) {
        setNeedsRestart(true);
      }
    });

    const unsubRemoved = window.electronAPI.onLibraryCommandRemoved(() => {
      loadCommands();
      loadTaskCommands();
    });

    return () => {
      unsubCommands();
      unsubFileChanged();
      unsubRemoved();
    };
  }, [currentTaskId, taskCommands]);

  const handleAddCommands = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.commandLibrary.addCommands();
      if (result.success && result.data) {
        const { added, updated, errors } = result.data;

        if (errors.length > 0) {
          console.error('Failed to add some commands:', errors);
          // TODO: Show toast with errors
        }

        if (added > 0 || updated > 0) {
          await loadCommands();
          await loadTaskCommands();
          // TODO: Show toast with success message
        }
      }
    } catch (error) {
      console.error('Failed to add commands:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCommand = async (commandId: string, enabled: boolean) => {
    if (!currentTaskId) return;

    try {
      const result = await window.electronAPI.commandLibrary.toggleCommand({
        taskId: currentTaskId,
        commandId,
        enabled,
      });

      if (result.success) {
        // Update local state
        setTaskCommands((prev) => new Map(prev).set(commandId, enabled));
        setNeedsRestart(true);
      }
    } catch (error) {
      console.error('Failed to toggle command:', error);
    }
  };

  const handleToggleDefault = async (commandId: string, enabledByDefault: boolean) => {
    try {
      const result = await window.electronAPI.commandLibrary.updateDefault({
        commandId,
        enabledByDefault,
      });

      if (result.success) {
        // Reload commands to reflect the change
        await loadCommands();
      }
    } catch (error) {
      console.error('Failed to update default:', error);
    }
  };

  const handleEditCommand = async (filePath: string) => {
    try {
      await window.electronAPI.commandLibrary.openInEditor(filePath);
    } catch (error) {
      console.error('Failed to open command file:', error);
    }
  };

  const handleDeleteCommand = async (commandId: string) => {
    try {
      const result = await window.electronAPI.commandLibrary.deleteCommand(commandId);
      if (result.success) {
        await loadCommands();
        await loadTaskCommands();
      }
    } catch (error) {
      console.error('Failed to delete command:', error);
    }
  };

  const handleRestart = async () => {
    if (!currentTaskId || !taskPath) return;

    try {
      // Kill current PTY
      window.electronAPI.ptyKill(currentTaskId);

      // Re-inject commands
      await window.electronAPI.commandLibrary.reinjectCommands({
        taskId: currentTaskId,
        cwd: taskPath,
      });

      // Restart PTY (this will be handled by the parent component's terminal manager)
      // For now, just clear the restart flag
      setNeedsRestart(false);

      // TODO: Trigger PTY restart from parent
    } catch (error) {
      console.error('Failed to restart session:', error);
    }
  };

  const isCommandEnabled = (commandId: string): boolean => {
    // Check task-specific state first
    const taskState = taskCommands.get(commandId);
    if (taskState !== undefined) {
      return taskState;
    }

    // Fallback to command's default
    const command = commands.find((c) => c.id === commandId);
    return command?.enabledByDefault ?? true;
  };

  if (!currentTaskId) {
    return (
      <div
        className="h-full flex flex-col overflow-hidden"
        style={{ background: 'hsl(var(--surface-1))' }}
      >
        <div className="flex items-center justify-between px-3 h-10 flex-shrink-0 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Library size={11} strokeWidth={2} className="text-muted-foreground/60" />
            <span className="text-[11px] font-semibold uppercase text-foreground/80 tracking-[0.08em]">
              Library
            </span>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center p-4 text-center">
          <p className="text-sm text-muted-foreground">Select a task to manage commands</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: 'hsl(var(--surface-1))' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-10 flex-shrink-0 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Library size={11} strokeWidth={2} className="text-muted-foreground/60" />
          <span className="text-[11px] font-semibold uppercase text-foreground/80 tracking-[0.08em]">
            Library
          </span>
          {commands.length > 0 && (
            <span className="min-w-[18px] h-[16px] flex items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary tabular-nums px-1">
              {commands.length}
            </span>
          )}
        </div>
        <button
          onClick={handleAddCommands}
          disabled={loading}
          className="p-[3px] rounded hover:bg-accent text-muted-foreground/40 hover:text-foreground transition-colors disabled:opacity-50"
          title="Add commands"
        >
          <Plus size={11} strokeWidth={2} />
        </button>
      </div>

      {/* Restart alert */}
      {needsRestart && (
        <div className="border-b border-border/60 bg-surface-2 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Commands changed</p>
            <button
              onClick={handleRestart}
              className="rounded bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary/90"
            >
              Restart Claude
            </button>
          </div>
        </div>
      )}

      {/* Commands list */}
      <div className="flex-1 overflow-y-auto">
        {commands.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm text-muted-foreground">No commands yet</p>
            <button
              onClick={handleAddCommands}
              className="text-xs text-primary hover:underline"
              disabled={loading}
            >
              Add your first command
            </button>
          </div>
        ) : (
          <div className="space-y-px">
            {commands.map((command) => (
              <CommandItem
                key={command.id}
                command={command}
                enabled={isCommandEnabled(command.id)}
                onToggle={(enabled) => handleToggleCommand(command.id, enabled)}
                onToggleDefault={(enabled) => handleToggleDefault(command.id, enabled)}
                onEdit={() => handleEditCommand(command.filePath)}
                onDelete={() => handleDeleteCommand(command.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
