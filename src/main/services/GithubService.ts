import { execFile } from 'child_process';
import { promisify } from 'util';
import type { GithubIssue } from '@shared/types';

const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 15_000;

export class GithubService {
  static async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('gh', ['auth', 'status'], {
        timeout: TIMEOUT_MS,
        env: process.env as Record<string, string>,
      });
      return true;
    } catch {
      return false;
    }
  }

  static async searchIssues(cwd: string, query: string): Promise<GithubIssue[]> {
    const args = ['issue', 'list'];
    if (query.trim()) {
      args.push('--search', query);
    }
    args.push('--json', 'number,title,labels,state,body,url,assignees', '--limit', '20');

    const { stdout } = await execFileAsync('gh', args, {
      cwd,
      timeout: TIMEOUT_MS,
      env: process.env as Record<string, string>,
    });

    const raw = JSON.parse(stdout);
    return raw.map(mapIssue);
  }

  static async getIssue(cwd: string, number: number): Promise<GithubIssue> {
    const { stdout } = await execFileAsync(
      'gh',
      [
        'issue',
        'view',
        String(number),
        '--json',
        'number,title,labels,state,body,url,assignees',
      ],
      { cwd, timeout: TIMEOUT_MS, env: process.env as Record<string, string> },
    );

    return mapIssue(JSON.parse(stdout));
  }

  static async postBranchComment(
    cwd: string,
    issueNumber: number,
    branch: string,
  ): Promise<void> {
    const body = `A task branch has been created for this issue:\n\n\`\`\`\n${branch}\n\`\`\``;
    await execFileAsync('gh', ['issue', 'comment', String(issueNumber), '--body', body], {
      cwd,
      timeout: TIMEOUT_MS,
      env: process.env as Record<string, string>,
    });
  }
}

function mapIssue(raw: Record<string, unknown>): GithubIssue {
  const labels = Array.isArray(raw.labels)
    ? raw.labels.map((l: Record<string, unknown>) => (typeof l === 'string' ? l : l.name) as string)
    : [];
  const assignees = Array.isArray(raw.assignees)
    ? raw.assignees.map((a: Record<string, unknown>) =>
        (typeof a === 'string' ? a : a.login) as string,
      )
    : [];

  return {
    number: raw.number as number,
    title: raw.title as string,
    labels,
    state: raw.state as string,
    body: raw.body as string,
    url: raw.url as string,
    assignees,
  };
}
