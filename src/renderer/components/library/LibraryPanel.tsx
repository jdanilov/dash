import { useState, useEffect, useCallback } from 'react';
import { Plus, Library, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { CommandItem } from './CommandItem';
import { MetapromptItem } from './MetapromptItem';
import { McpItem } from './McpItem';
import type { LibraryCommand, LibraryMcp } from '@shared/types';

interface LibraryPanelProps {
  currentTaskId: string | null;
  taskPath: string | null;
}

export function LibraryPanel({ currentTaskId, taskPath }: LibraryPanelProps) {
  // Store commands with their enabled state (computed by service)
  const [taskCommands, setTaskCommands] = useState<
    Array<{ command: LibraryCommand; enabled: boolean }>
  >([]);
  // Store MCPs with their enabled state
  const [taskMcps, setTaskMcps] = useState<Array<{ mcp: LibraryMcp; enabled: boolean }>>([]);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  /**
   * Load commands for the current task with enabled state.
   * The enabled state is computed by the service:
   * - If task has an override, use that
   * - Otherwise, fall back to command's enabledByDefault
   */
  const loadTaskCommands = useCallback(async () => {
    if (!currentTaskId) {
      setTaskCommands([]);
      return;
    }

    const result = await window.electronAPI.commandLibrary.getTaskCommands(currentTaskId);
    if (result.success && result.data) {
      setTaskCommands(result.data);
    }
  }, [currentTaskId]);

  /**
   * Load MCPs for the current task with enabled state.
   */
  const loadTaskMcps = useCallback(async () => {
    if (!currentTaskId) {
      setTaskMcps([]);
      return;
    }

    const result = await window.electronAPI.mcpLibrary.getTaskMcps(currentTaskId);
    if (result.success && result.data) {
      setTaskMcps(result.data);
    }
  }, [currentTaskId]);

  // Initial load and reload when task changes
  useEffect(() => {
    loadTaskCommands();
    loadTaskMcps();
    setNeedsRestart(false);
  }, [loadTaskCommands, loadTaskMcps]);

  // Listen for command changes
  useEffect(() => {
    const unsubCommands = window.electronAPI.onLibraryCommandsChanged((data) => {
      if (data.taskId === currentTaskId) {
        setNeedsRestart(true);
      }
    });

    const unsubFileChanged = window.electronAPI.onLibraryCommandFileChanged((data) => {
      // Check if this command is enabled for current task
      const commandData = taskCommands.find((tc) => tc.command.id === data.commandId);
      if (commandData?.enabled) {
        setNeedsRestart(true);
      }
    });

    const unsubRemoved = window.electronAPI.onLibraryCommandRemoved(() => {
      loadTaskCommands();
    });

    return () => {
      unsubCommands();
      unsubFileChanged();
      unsubRemoved();
    };
  }, [currentTaskId, taskCommands, loadTaskCommands]);

  // Separate by type for rendering (already sorted by service)
  const commands = taskCommands.filter((tc) => tc.command.type === 'command');
  const metaprompts = taskCommands.filter((tc) => tc.command.type === 'metaprompt');
  const skills = taskCommands.filter((tc) => tc.command.type === 'skill');

  // Listen for MCP changes
  useEffect(() => {
    const unsubMcpToggled = window.electronAPI.onMcpToggled((data) => {
      if (data.taskId === currentTaskId) {
        setNeedsRestart(true);
      }
    });

    const unsubSourceChanged = window.electronAPI.onMcpSourceChanged(() => {
      loadTaskMcps();
      setNeedsRestart(true);
    });

    const unsubSourceRemoved = window.electronAPI.onMcpSourceRemoved(() => {
      loadTaskMcps();
    });

    return () => {
      unsubMcpToggled();
      unsubSourceChanged();
      unsubSourceRemoved();
    };
  }, [currentTaskId, loadTaskMcps]);

  const handleAddResources = async () => {
    setLoading(true);
    setShowAddMenu(false);
    try {
      const result = await window.electronAPI.commandLibrary.addCommands();
      if (result.success && result.data) {
        const { added, updated, errors } = result.data;

        if (errors.length > 0) {
          console.error('Failed to add some resources:', errors);
          errors.forEach((err) => {
            toast.error(`Failed to add: ${err.path}`, {
              description: err.error,
            });
          });
        }

        if (added > 0 || updated > 0) {
          await loadTaskCommands();
          // Mark needs restart since we added/updated resources
          setNeedsRestart(true);

          const parts: string[] = [];
          if (added > 0) parts.push(`${added} added`);
          if (updated > 0) parts.push(`${updated} updated`);
          toast.success(`Resources ${parts.join(', ')}`);
        } else if (errors.length === 0) {
          toast.info('No resources were selected');
        }
      } else {
        toast.error('Failed to add resources', {
          description: result.error,
        });
      }
    } catch (error) {
      console.error('Failed to add resources:', error);
      toast.error('Failed to add resources', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddMcp = async () => {
    setLoading(true);
    setShowAddMenu(false);
    try {
      const result = await window.electronAPI.mcpLibrary.addSource();
      if (result.success && result.data) {
        const { added, updated, errors } = result.data;

        if (errors.length > 0) {
          console.error('Failed to add some MCPs:', errors);
          errors.forEach((err) => {
            toast.error(`Failed to add MCP: ${err.name}`, {
              description: err.error,
            });
          });
        }

        if (added.length > 0 || updated.length > 0) {
          await loadTaskMcps();
          setNeedsRestart(true);

          const parts: string[] = [];
          if (added.length > 0) parts.push(`${added.length} added`);
          if (updated.length > 0) parts.push(`${updated.length} updated`);
          toast.success(`MCPs ${parts.join(', ')}`);
        } else if (errors.length === 0) {
          toast.info('No MCP file was selected');
        }
      } else {
        toast.error('Failed to add MCPs', {
          description: result.error,
        });
      }
    } catch (error) {
      console.error('Failed to add MCPs:', error);
      toast.error('Failed to add MCPs', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMcp = async (mcpId: string, enabled: boolean) => {
    if (!currentTaskId) return;

    try {
      const result = await window.electronAPI.mcpLibrary.toggleMcp({
        taskId: currentTaskId,
        mcpId,
        enabled,
      });

      if (result.success) {
        setTaskMcps((prev) => prev.map((tm) => (tm.mcp.id === mcpId ? { ...tm, enabled } : tm)));
        setNeedsRestart(true);
      }
    } catch (error) {
      console.error('Failed to toggle MCP:', error);
    }
  };

  const handleToggleMcpDefault = async (mcpId: string, enabledByDefault: boolean) => {
    try {
      const result = await window.electronAPI.mcpLibrary.updateDefault({
        mcpId,
        enabledByDefault,
      });

      if (result.success) {
        await loadTaskMcps();
      }
    } catch (error) {
      console.error('Failed to update MCP default:', error);
    }
  };

  const handleDeleteMcp = async (mcpId: string) => {
    try {
      const result = await window.electronAPI.mcpLibrary.deleteMcp(mcpId);
      if (result.success) {
        await loadTaskMcps();
        toast.success('MCP removed');
      } else {
        toast.error('Failed to remove MCP', {
          description: result.error,
        });
      }
    } catch (error) {
      console.error('Failed to remove MCP:', error);
      toast.error('Failed to remove MCP', {
        description: error instanceof Error ? error.message : String(error),
      });
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
        // Update local state optimistically
        setTaskCommands((prev) =>
          prev.map((tc) => (tc.command.id === commandId ? { ...tc, enabled } : tc)),
        );
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
        await loadTaskCommands();
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
        await loadTaskCommands();
        toast.success('Resource deleted');
      } else {
        toast.error('Failed to delete resource', {
          description: result.error,
        });
      }
    } catch (error) {
      console.error('Failed to delete resource:', error);
      toast.error('Failed to delete resource', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleInvokeCommand = async (command: LibraryCommand) => {
    if (!currentTaskId) return;

    try {
      // Send command to terminal without Enter (user can add args)
      await window.electronAPI.ptyInput({
        id: currentTaskId,
        data: command.displayName,
      });
    } catch (error) {
      console.error('Failed to invoke command:', error);
    }
  };

  const handleRestart = async () => {
    if (!currentTaskId || !taskPath) return;

    try {
      // Prepare restart: re-inject commands and MCPs
      const commandResult = await window.electronAPI.commandLibrary.prepareRestart({
        taskId: currentTaskId,
        cwd: taskPath,
      });

      if (!commandResult.success) {
        console.error('Failed to prepare restart (commands):', commandResult.error);
        toast.error('Failed to update commands', {
          description: commandResult.error,
        });
        return;
      }

      const mcpResult = await window.electronAPI.mcpLibrary.prepareRestart({
        taskId: currentTaskId,
        cwd: taskPath,
      });

      if (!mcpResult.success) {
        console.error('Failed to prepare restart (MCPs):', mcpResult.error);
        toast.error('Failed to update MCPs', {
          description: mcpResult.error,
        });
        return;
      }

      // Restart the PTY session via SessionRegistry
      const { sessionRegistry } = await import('../../terminal/SessionRegistry');
      await sessionRegistry.restart(currentTaskId);

      // Clear the restart flag
      setNeedsRestart(false);

      toast.success('Session restarted with updated resources');
    } catch (error) {
      console.error('Failed to restart session:', error);
      toast.error('Failed to restart session', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (!currentTaskId) {
    return (
      <div
        className="h-full flex flex-col overflow-hidden border-t border-border/60"
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
      className="h-full flex flex-col overflow-hidden border-t border-border/60"
      style={{ background: 'hsl(var(--surface-1))' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-10 flex-shrink-0 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Library size={11} strokeWidth={2} className="text-muted-foreground/60" />
          <span className="text-[11px] font-semibold uppercase text-foreground/80 tracking-[0.08em]">
            Library
          </span>
          {(taskCommands.length > 0 || taskMcps.length > 0) && (
            <span className="min-w-[18px] h-[16px] flex items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary tabular-nums px-1">
              {taskCommands.length + taskMcps.length}
            </span>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            disabled={loading}
            className="p-[3px] rounded hover:bg-accent text-muted-foreground/40 hover:text-foreground transition-colors disabled:opacity-50 flex items-center gap-0.5"
            title="Add resources"
          >
            <Plus size={11} strokeWidth={2} />
            <ChevronDown size={9} strokeWidth={2} />
          </button>
          {showAddMenu && (
            <div
              className="absolute right-0 top-full mt-1 z-50 min-w-[170px] rounded-md border border-border bg-surface-1 shadow-lg py-1"
              onMouseLeave={() => setShowAddMenu(false)}
            >
              <button
                onClick={handleAddResources}
                className="w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent/50 transition-colors"
              >
                Import .claude/commands
              </button>
              <button
                onClick={handleAddResources}
                className="w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent/50 transition-colors"
              >
                Import .claude/skills
              </button>
              <button
                onClick={handleAddResources}
                className="w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent/50 transition-colors"
              >
                Import .claude/metaprompts
              </button>
              <button
                onClick={handleAddMcp}
                className="w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent/50 transition-colors"
              >
                Import .mcp.json
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Restart alert */}
      {needsRestart && (
        <div className="border-b border-border/60 bg-surface-0 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Resources changed</p>
            <button
              onClick={handleRestart}
              className="rounded bg-surface-2 px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-3 transition-colors"
            >
              Restart
            </button>
          </div>
        </div>
      )}

      {/* Resources list */}
      <div className="flex-1 overflow-y-auto">
        {taskCommands.length === 0 && taskMcps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent/40 flex items-center justify-center">
              <Library size={14} className="text-foreground/50" strokeWidth={1.5} />
            </div>
            <p className="text-[11px] text-foreground/60">No resources</p>
          </div>
        ) : (
          <div className="px-2 pt-1">
            {/* Commands */}
            {commands.map((tc) => (
              <CommandItem
                key={tc.command.id}
                command={tc.command}
                enabled={tc.enabled}
                onToggle={(enabled) => handleToggleCommand(tc.command.id, enabled)}
                onToggleDefault={(enabled) => handleToggleDefault(tc.command.id, enabled)}
                onEdit={() => handleEditCommand(tc.command.filePath)}
                onDelete={() => handleDeleteCommand(tc.command.id)}
                onInvoke={() => handleInvokeCommand(tc.command)}
              />
            ))}

            {/* Metaprompts */}
            {metaprompts.map((tc) => (
              <MetapromptItem
                key={tc.command.id}
                metaprompt={tc.command}
                enabled={tc.enabled}
                onToggle={(enabled) => handleToggleCommand(tc.command.id, enabled)}
                onToggleDefault={(enabled) => handleToggleDefault(tc.command.id, enabled)}
                onEdit={() => handleEditCommand(tc.command.filePath)}
                onDelete={() => handleDeleteCommand(tc.command.id)}
              />
            ))}

            {/* Skills */}
            {skills.map((tc) => (
              <CommandItem
                key={tc.command.id}
                command={tc.command}
                enabled={tc.enabled}
                onToggle={(enabled) => handleToggleCommand(tc.command.id, enabled)}
                onToggleDefault={(enabled) => handleToggleDefault(tc.command.id, enabled)}
                onEdit={() => handleEditCommand(tc.command.filePath)}
                onDelete={() => handleDeleteCommand(tc.command.id)}
              />
            ))}

            {/* MCPs */}
            {taskMcps.map((tm) => (
              <McpItem
                key={tm.mcp.id}
                mcp={tm.mcp}
                enabled={tm.enabled}
                onToggle={(enabled) => handleToggleMcp(tm.mcp.id, enabled)}
                onToggleDefault={(enabled) => handleToggleMcpDefault(tm.mcp.id, enabled)}
                onDelete={() => handleDeleteMcp(tm.mcp.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
