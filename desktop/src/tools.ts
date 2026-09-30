export type ToolTab = 'output' | 'browser' | 'terminal' | 'tasks' | 'files' | 'changes';
export type ToolRequest = { tool: 'browser' | 'terminal' | 'files' | 'changes'; input: string; content?: string };
export type BackgroundTask = {
  id: string;
  command: string;
  cwd: string;
  status: 'running' | 'done' | 'failed' | 'cancelled' | 'interrupted';
  output: string;
  code?: number | null;
  at: string;
};
export type FileChange = { id: string; path: string; before: string; after: string; hash: string; root: string; at: string };
export function toolRequests(text: string): ToolRequest[] {
  const results: ToolRequest[] = [];
  for (const match of text.matchAll(/```step-tool\s*\n([\s\S]*?)```/g)) {
    try {
      const v = JSON.parse(match[1]);
      if (
        ['browser', 'terminal', 'files', 'changes'].includes(v.tool) &&
        typeof v.input === 'string' &&
        v.input.length <= 2000 &&
        (v.content === undefined || (typeof v.content === 'string' && v.content.length <= 200000))
      )
        results.push({ tool: v.tool, input: v.input, ...(v.content !== undefined ? { content: v.content } : {}) });
    } catch {
      /* Malformed requests remain inert chat text. */
    }
  }
  return results.slice(0, 8);
}
