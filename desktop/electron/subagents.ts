import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { rm, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const exec = promisify(execFile);

export type SubagentWorkspaceMode = 'inherit' | 'branch' | 'share';

export type SubagentTask = {
  id: string;
  parentId: string;
  role: string;
  prompt: string;
  workspaceMode: SubagentWorkspaceMode;
  workspacePath?: string;
  branchName?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
};

export class SubagentManager {
  private active = new Map<string, SubagentTask>();

  async spawn(
    parentId: string,
    workspaceRoot: string,
    params: {
      role: string;
      prompt: string;
      workspace?: SubagentWorkspaceMode;
    },
    runFn?: (subagent: SubagentTask, workPath: string) => Promise<string>,
  ): Promise<SubagentTask> {
    const role = params.role?.trim();
    const prompt = params.prompt?.trim();
    if (!role || !prompt) throw new Error('INVALID_INPUT');

    const mode: SubagentWorkspaceMode = params.workspace ?? 'inherit';
    const id = `subagent-${randomUUID().slice(0, 8)}`;
    const branchName = mode === 'branch' ? `subagent/${id}` : undefined;
    let worktreePath: string | undefined;

    if (mode === 'branch') {
      worktreePath = resolve(workspaceRoot, '.worktrees', id);
      await mkdir(resolve(workspaceRoot, '.worktrees'), { recursive: true });
      try {
        await exec('git', ['-C', workspaceRoot, 'worktree', 'add', '-b', branchName!, worktreePath, 'HEAD'], {
          windowsHide: true,
          timeout: 15000,
        });
      } catch {
        // Fall back gracefully if worktree cannot be created
        worktreePath = workspaceRoot;
      }
    } else {
      worktreePath = workspaceRoot;
    }

    const task: SubagentTask = {
      id,
      parentId,
      role,
      prompt,
      workspaceMode: mode,
      workspacePath: worktreePath,
      branchName,
      status: 'running',
      startedAt: new Date().toISOString(),
    };

    this.active.set(id, task);

    try {
      let output: string;
      if (runFn) {
        output = await runFn(task, worktreePath);
      } else {
        output = `Subagent ${id} (${role}) initialized in ${mode} mode. Ready to execute prompt: "${prompt.slice(0, 100)}..."`;
      }
      task.status = 'completed';
      task.result = output;
      task.completedAt = new Date().toISOString();
    } catch (err: unknown) {
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : String(err);
      task.completedAt = new Date().toISOString();
    } finally {
      if (mode === 'branch' && worktreePath && worktreePath !== workspaceRoot) {
        try {
          await exec('git', ['-C', workspaceRoot, 'worktree', 'remove', '--force', worktreePath], {
            windowsHide: true,
            timeout: 10000,
          });
        } catch {
          await rm(worktreePath, { recursive: true, force: true }).catch(() => {});
        }
      }
    }

    return task;
  }

  get(id: string): SubagentTask | undefined {
    return this.active.get(id);
  }

  list(parentId?: string): SubagentTask[] {
    const all = [...this.active.values()];
    return parentId ? all.filter(t => t.parentId === parentId) : all;
  }
}
