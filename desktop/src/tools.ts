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
export type FileChange = {
  id: string;
  path: string;
  before: string;
  after: string;
  hash: string;
  root: string;
  at: string;
  binary?: string;
  snapshotId?: string;
};
export const LOOP_TOOLS = [
  'browser',
  'terminal',
  'files',
  'changes',
  'tasks',
  'web_search',
  'web_fetch',
  'skill',
  'reference',
  'doc_outline',
  'doc_section',
  'sheet_read',
  'sheet_edit',
  'ask_user',
  'plan',
  'snapshot',
  'read_remaining',
] as const;
export type LoopRequest = { tool: (typeof LOOP_TOOLS)[number]; input: string; content?: string; args?: Record<string, unknown> };
/** Parse only explicit protocol fences. All arguments are still validated by the host. */
export function loopRequests(text: string): LoopRequest[] {
  const requests: LoopRequest[] = [];
  for (const match of text.matchAll(/```step-tool\s*\n([\s\S]*?)```/g)) {
    if (match[1].length > 210_000) continue;
    try {
      const r = JSON.parse(match[1]);
      if (!r || !LOOP_TOOLS.includes(r.tool) || typeof r.input !== 'string' || r.input.length > 2000 || r.input.includes('\0')) continue;
      if (r.content !== undefined && (typeof r.content !== 'string' || r.content.length > 200_000)) continue;
      if (
        r.args !== undefined &&
        (!r.args || typeof r.args !== 'object' || Array.isArray(r.args) || JSON.stringify(r.args).length > 30_000)
      )
        continue;
      requests.push({
        tool: r.tool,
        input: r.input,
        ...(r.content !== undefined ? { content: r.content } : {}),
        ...(r.args ? { args: r.args } : {}),
      });
    } catch {
      /* Malformed proposals are inert. */
    }
    if (requests.length === 8) break;
  }
  return requests;
}
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
