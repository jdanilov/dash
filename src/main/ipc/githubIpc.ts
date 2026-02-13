import { ipcMain } from 'electron';
import { GithubService } from '../services/GithubService';

export function registerGithubIpc(): void {
  ipcMain.handle('github:check-available', async () => {
    try {
      const available = await GithubService.isAvailable();
      return { success: true, data: available };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(
    'github:search-issues',
    async (_event, args: { cwd: string; query: string }) => {
      try {
        const issues = await GithubService.searchIssues(args.cwd, args.query);
        return { success: true, data: issues };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    'github:get-issue',
    async (_event, args: { cwd: string; number: number }) => {
      try {
        const issue = await GithubService.getIssue(args.cwd, args.number);
        return { success: true, data: issue };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    'github:post-branch-comment',
    async (_event, args: { cwd: string; issueNumber: number; branch: string }) => {
      try {
        await GithubService.postBranchComment(args.cwd, args.issueNumber, args.branch);
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    'github:link-branch',
    async (_event, args: { cwd: string; issueNumber: number; branch: string }) => {
      try {
        await GithubService.linkBranch(args.cwd, args.issueNumber, args.branch);
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );
}
