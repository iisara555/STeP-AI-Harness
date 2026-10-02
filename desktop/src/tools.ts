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
  'mcp_search',
  'mcp_call',
  'sandbox',
  'browser',
  'browser_control',
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
/**
 * A reply that is nothing but one tool request in a ```json fence, an unlabelled fence or bare JSON. Smaller models
 * use these instead of step-tool; a JSON example inside a longer answer is never read as a request.
 */
function looseRequest(text: string) {
  const body = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(text.trim())?.[1] ?? text.trim();
  return body.startsWith('{') && /"tool"\s*:/.test(body) ? [body] : [];
}
/** Parse explicit protocol fences, or a reply made of a single tool request. All arguments are still validated by the host. */
export function loopRequests(text: string): LoopRequest[] {
  const requests: LoopRequest[] = [];
  const fenced = [...text.matchAll(/```step-tool\s*\n([\s\S]*?)```/g)].map(match => match[1]);
  for (const body of fenced.length ? fenced : looseRequest(text)) {
    if (body.length > 210_000) continue;
    try {
      const r = JSON.parse(body);
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

/**
 * What the employee sees of a reply while it streams: the model's own words, without the tool requests it writes
 * between them (step-tool fences, a json fence or bare JSON holding {"tool": ...}), including one still being typed.
 */
export function visibleStream(text: string) {
  let shown = text
    .replace(/```(?:step-tool|json)?[ \t]*\n?\s*\{\s*"tool"\s*:[\s\S]*?(?:```|$)/g, '')
    .replace(/```step-tool[\s\S]*?(?:```|$)/g, '')
    .replace(/(^|\n\n)\s*\{\s*"tool"\s*:[\s\S]*?(?=\n\n|$)/g, '$1');
  // A fence just opened (its language not yet known) may still become a tool request; wait for the next characters.
  if ((shown.match(/```/g) || []).length % 2 === 1) shown = shown.replace(/```[a-z-]*$/, '');
  return shown
    .replace(/(?<!`)`{1,2}$/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
