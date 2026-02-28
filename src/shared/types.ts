/**
 * Permission mode for Claude Code operations.
 * - 'paranoid': Approve all operations (safest, default)
 * - 'safe': Auto-approve safe operations, block dangerous ones (git force, rm -rf, etc.)
 * - 'yolo': Skip all permission checks (dangerous)
 */
export type PermissionMode = 'paranoid' | 'safe' | 'yolo';

/**
 * Claude model selection for tasks.
 * - 'opus': Most capable (default)
 * - 'sonnet': Balanced performance
 * - 'haiku': Fastest, most economical
 */
export type ClaudeModel = 'opus' | 'sonnet' | 'haiku';

export interface Project {
  id: string;
  name: string;
  path: string;
  gitRemote: string | null;
  gitBranch: string | null;
  baseRef: string | null;
  defaultMetaprompts: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  name: string;
  branch: string;
  path: string;
  status: string;
  useWorktree: boolean;
  permissionMode: PermissionMode;
  model: ClaudeModel;
  linkedIssues: number[] | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  taskId: string;
  title: string;
  isActive: boolean;
  isMain: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface WorktreeInfo {
  id: string;
  name: string;
  branch: string;
  path: string;
  projectId: string;
  status: 'active' | 'error';
  createdAt: string;
}

export interface ReserveWorktree {
  id: string;
  path: string;
  branch: string;
  projectId: string;
  projectPath: string;
  baseRef: string;
  createdAt: string;
}

export interface RemoveWorktreeOptions {
  deleteWorktreeDir?: boolean;
  deleteLocalBranch?: boolean;
  deleteRemoteBranch?: boolean;
}

export interface PtyOptions {
  id: string;
  cwd: string;
  cols: number;
  rows: number;
  permissionMode?: PermissionMode;
  resume?: boolean;
}

export interface TerminalSnapshot {
  version: 1;
  createdAt: string;
  cols: number;
  rows: number;
  data: string;
}

// ── Branch Types ─────────────────────────────────────────────

export interface BranchInfo {
  name: string; // "main", "develop"
  ref: string; // "origin/main", "origin/develop"
  shortHash: string; // "a1b2c3d"
  relativeDate: string; // "2 days ago"
}

// ── Git Types ────────────────────────────────────────────────

export type FileChangeStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'conflicted';

export interface FileChange {
  path: string;
  status: FileChangeStatus;
  staged: boolean;
  additions: number;
  deletions: number;
  oldPath?: string; // For renames
}

export interface GitStatus {
  branch: string | null;
  ahead: number;
  behind: number;
  files: FileChange[];
}

export interface DiffResult {
  filePath: string;
  hunks: DiffHunk[];
  isBinary: boolean;
  additions: number;
  deletions: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'delete' | 'context';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

// ── Commit Graph Types ──────────────────────────────────────

export interface CommitRef {
  name: string;
  type: 'local' | 'remote' | 'tag' | 'head';
}

export interface CommitNode {
  hash: string;
  shortHash: string;
  parents: string[];
  authorName: string;
  authorDate: number;
  subject: string;
  refs: CommitRef[];
}

export interface GraphConnection {
  fromColumn: number;
  toColumn: number;
  fromRow: number;
  toRow: number;
  color: number;
  type: 'straight' | 'merge-in' | 'merge-out';
}

export interface GraphCommit {
  commit: CommitNode;
  lane: number;
  laneColor: number;
  connections: GraphConnection[];
}

export interface CommitGraphData {
  commits: GraphCommit[];
  totalCount: number;
  maxLanes: number;
}

export interface CommitDetail {
  commit: CommitNode;
  body: string;
  stats: { additions: number; deletions: number; filesChanged: number };
}

// ── GitHub Types ────────────────────────────────────────────

export interface GithubIssue {
  number: number;
  title: string;
  labels: string[];
  state: string;
  body: string;
  url: string;
  assignees?: string[];
}

// ── Remote Control Types ────────────────────────────────────

export interface RemoteControlState {
  url: string;
  active: boolean;
}

// ── Library Types ────────────────────────────────────────

export interface LibraryCommand {
  id: string;
  name: string;
  displayName: string;
  filePath: string;
  type: 'command' | 'skill' | 'metaprompt';
  enabledByDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskCommand {
  id: string;
  taskId: string;
  commandId: string;
  enabled: boolean;
  updatedAt: string;
}

export interface TaskCommandWithDetails extends TaskCommand {
  command: LibraryCommand;
}

// ── MCP Library Types ────────────────────────────────────

export interface LibraryMcp {
  id: string;
  sourceFilePath: string;
  name: string;
  config: string; // JSON: { command, args, env? }
  enabledByDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskMcp {
  id: string;
  taskId: string;
  mcpId: string;
  enabled: boolean;
  updatedAt: string;
}

export interface TaskMcpWithDetails extends TaskMcp {
  mcp: LibraryMcp;
}

export interface McpConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
