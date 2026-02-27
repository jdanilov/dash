import { ipcMain, dialog } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { commandLibraryService } from '../services/CommandLibraryService';

const execFileAsync = promisify(execFile);

let cachedEditor: string | null = null;

async function detectEditor(): Promise<string> {
  if (cachedEditor) return cachedEditor;

  // Check environment variables first
  for (const envVar of ['VISUAL', 'EDITOR']) {
    const val = process.env[envVar];
    if (val) {
      cachedEditor = val;
      return val;
    }
  }

  // Probe for known editors
  for (const editor of ['cursor', 'code', 'zed']) {
    try {
      await execFileAsync('which', [editor]);
      cachedEditor = editor;
      return editor;
    } catch {
      // Not found, try next
    }
  }

  // Fallback to macOS open -t (text editor)
  cachedEditor = 'open';
  return 'open';
}

export function registerCommandLibraryIpc(): void {
  // Add commands from file picker
  ipcMain.handle('commandLibrary:addCommands', async (event, filePaths?: string[]) => {
    try {
      let paths = filePaths;

      // If no paths provided, show file picker
      if (!paths) {
        const result = await dialog.showOpenDialog({
          title: 'Add Commands',
          buttonLabel: 'Add',
          filters: [{ name: 'Markdown Files', extensions: ['md'] }],
          properties: ['openFile', 'multiSelections'],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { success: true, data: { added: 0, updated: 0, errors: [] } };
        }

        paths = result.filePaths;
      }

      const result = await commandLibraryService.addCommands(paths);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Get all library commands
  ipcMain.handle('commandLibrary:getAll', async () => {
    try {
      const commands = await commandLibraryService.getAllCommands();
      return { success: true, data: commands };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Get commands for a specific task
  ipcMain.handle('commandLibrary:getTaskCommands', async (_event, taskId: string) => {
    try {
      const commands = await commandLibraryService.getTaskCommands(taskId);
      return { success: true, data: commands };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Toggle command for task
  ipcMain.handle(
    'commandLibrary:toggleCommand',
    async (_event, args: { taskId: string; commandId: string; enabled: boolean }) => {
      try {
        await commandLibraryService.toggleCommand(args.taskId, args.commandId, args.enabled);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  // Update command's enabledByDefault flag
  ipcMain.handle(
    'commandLibrary:updateDefault',
    async (_event, args: { commandId: string; enabledByDefault: boolean }) => {
      try {
        await commandLibraryService.updateCommandDefault(args.commandId, args.enabledByDefault);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  // Delete command from library
  ipcMain.handle('commandLibrary:deleteCommand', async (_event, commandId: string) => {
    try {
      await commandLibraryService.deleteCommand(commandId);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Reinject commands for a task (after restart)
  ipcMain.handle(
    'commandLibrary:reinjectCommands',
    async (_event, args: { taskId: string; cwd: string }) => {
      try {
        await commandLibraryService.injectCommands(args.taskId, args.cwd);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  // Open command file in external editor
  ipcMain.handle('commandLibrary:openInEditor', async (_event, filePath: string) => {
    try {
      if (!existsSync(filePath)) {
        return { success: false, error: `File not found: ${filePath}` };
      }

      const editor = await detectEditor();

      // Build args for known editors
      const gotoEditors = ['code', 'cursor', 'zed'];
      const isGotoEditor = gotoEditors.some((e) => editor === e || editor.endsWith(`/${e}`));

      if (isGotoEditor) {
        await execFileAsync(editor, ['-g', filePath]);
      } else if (editor === 'open') {
        // Use -t flag to open in text editor, not default app
        await execFileAsync('open', ['-t', filePath]);
      } else {
        // Generic editor (vim, nano, etc.)
        await execFileAsync(editor, [filePath]);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
