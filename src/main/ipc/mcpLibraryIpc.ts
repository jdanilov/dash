import { ipcMain, dialog } from 'electron';
import { mcpLibraryService } from '../services/McpLibraryService';

export function registerMcpLibraryIpc(): void {
  // Add MCPs from .mcp.json file picker
  ipcMain.handle('mcpLibrary:addSource', async (_event, filePath?: string) => {
    try {
      let sourcePath = filePath;

      // If no path provided, show file picker
      if (!sourcePath) {
        const result = await dialog.showOpenDialog({
          title: 'Add MCP Configuration',
          buttonLabel: 'Add',
          message: 'Select a .mcp.json file containing MCP server configurations',
          filters: [{ name: 'MCP Config', extensions: ['mcp.json'] }],
          properties: ['openFile'],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { success: true, data: { added: [], updated: [], errors: [] } };
        }

        sourcePath = result.filePaths[0];
      }

      const addResult = await mcpLibraryService.addSource(sourcePath!);
      return { success: true, data: addResult };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Get all library MCPs
  ipcMain.handle('mcpLibrary:getAll', async () => {
    try {
      const mcps = await mcpLibraryService.getAllMcps();
      return { success: true, data: mcps };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Get MCP source file paths
  ipcMain.handle('mcpLibrary:getSources', async () => {
    try {
      const sources = await mcpLibraryService.getSources();
      return { success: true, data: sources };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Get MCPs for a specific task
  ipcMain.handle('mcpLibrary:getTaskMcps', async (_event, taskId: string) => {
    try {
      const mcps = await mcpLibraryService.getTaskMcps(taskId);
      return { success: true, data: mcps };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Toggle MCP for task
  ipcMain.handle(
    'mcpLibrary:toggleMcp',
    async (_event, args: { taskId: string; mcpId: string; enabled: boolean }) => {
      try {
        await mcpLibraryService.toggleMcp(args.taskId, args.mcpId, args.enabled);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  // Update MCP's enabledByDefault flag
  ipcMain.handle(
    'mcpLibrary:updateDefault',
    async (_event, args: { mcpId: string; enabledByDefault: boolean }) => {
      try {
        await mcpLibraryService.updateMcpDefault(args.mcpId, args.enabledByDefault);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  // Delete single MCP from library
  ipcMain.handle('mcpLibrary:deleteMcp', async (_event, mcpId: string) => {
    try {
      await mcpLibraryService.deleteMcp(mcpId);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Remove entire source (all MCPs from that file)
  ipcMain.handle('mcpLibrary:removeSource', async (_event, sourceFilePath: string) => {
    try {
      await mcpLibraryService.removeSource(sourceFilePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Reinject MCPs for a task (manual trigger, independent of session lifecycle)
  ipcMain.handle(
    'mcpLibrary:reinjectMcps',
    async (_event, args: { taskId: string; cwd: string }) => {
      try {
        await mcpLibraryService.injectMcps(args.taskId, args.cwd);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  // Prepare for session restart: reinject MCPs before PTY respawn.
  // Separate from reinjectMcps to allow future pre-restart hooks/validation.
  ipcMain.handle(
    'mcpLibrary:prepareRestart',
    async (_event, args: { taskId: string; cwd: string }) => {
      try {
        await mcpLibraryService.injectMcps(args.taskId, args.cwd);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );
}
