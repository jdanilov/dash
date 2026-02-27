import { ipcMain, dialog } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { commandLibraryService } from '../services/CommandLibraryService';

const execFileAsync = promisify(execFile);

// Cache editor detection with TTL to allow for environment changes
interface EditorCache {
  editor: string;
  timestamp: number;
}

let cachedEditor: EditorCache | null = null;
const EDITOR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function detectEditor(): Promise<string> {
  // Check if cache is still valid
  if (cachedEditor && Date.now() - cachedEditor.timestamp < EDITOR_CACHE_TTL) {
    return cachedEditor.editor;
  }

  // Check environment variables first (VISUAL takes precedence over EDITOR)
  for (const envVar of ['VISUAL', 'EDITOR']) {
    const val = process.env[envVar];
    if (val) {
      cachedEditor = { editor: val, timestamp: Date.now() };
      return val;
    }
  }

  // Probe for known editors in order of preference
  const knownEditors = [
    'cursor', // Cursor (VS Code fork)
    'code', // VS Code
    'zed', // Zed
    'subl', // Sublime Text
    'atom', // Atom
    'idea', // IntelliJ IDEA
    'webstorm', // WebStorm
    'nvim', // Neovim
    'vim', // Vim
    'nano', // Nano
    'emacs', // Emacs
  ];

  for (const editor of knownEditors) {
    try {
      await execFileAsync('which', [editor]);
      cachedEditor = { editor, timestamp: Date.now() };
      return editor;
    } catch {
      // Not found, try next
    }
  }

  // Fallback to macOS open -t (text editor)
  const fallback = 'open';
  cachedEditor = { editor: fallback, timestamp: Date.now() };
  return fallback;
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

  // Reinject commands for a task (manually triggered, not coordinated with restart)
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

  // Coordinated restart: reinject commands then signal restart needed
  // The actual PTY restart is handled by the renderer (SessionRegistry)
  ipcMain.handle(
    'commandLibrary:prepareRestart',
    async (_event, args: { taskId: string; cwd: string }) => {
      try {
        // Re-inject commands with current enabled state
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

      // Editors that support -g flag for "go to file"
      const gotoEditors = ['code', 'cursor', 'zed', 'subl', 'atom'];
      const isGotoEditor = gotoEditors.some((e) => editor === e || editor.endsWith(`/${e}`));

      // JetBrains IDEs use different syntax
      const jetbrainsEditors = ['idea', 'webstorm'];
      const isJetBrains = jetbrainsEditors.some((e) => editor === e || editor.endsWith(`/${e}`));

      if (isGotoEditor) {
        // Modern GUI editors with -g flag
        await execFileAsync(editor, ['-g', filePath]);
      } else if (isJetBrains) {
        // JetBrains IDEs use --line 0 syntax
        await execFileAsync(editor, ['--line', '0', filePath]);
      } else if (editor === 'open') {
        // macOS open command - use -t flag to open in text editor, not default app
        await execFileAsync('open', ['-t', filePath]);
      } else {
        // Terminal editors (vim, nvim, nano, emacs, etc.) or unknown editors
        await execFileAsync(editor, [filePath]);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
