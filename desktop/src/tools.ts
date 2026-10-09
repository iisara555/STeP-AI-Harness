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
  'sheet_create',
  'slides_create',
  'ask_user',
  'plan',
  'plan_update',
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
  // A model may open the fence mid-sentence and end its reply without closing it; the last fence then runs to the end.
  const fenced = [...text.matchAll(/```step-tool[ \t]*\n([\s\S]*?)(?:```|$)/g)].map(match => match[1].trim());
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
/**
 * Why the step-tool blocks of a reply could not be read, one entry per block the loop would skip. A reply whose only
 * request is broken (often a long file whose quotes or line breaks were not escaped in JSON) must not end the task as
 * an answer: the person would see an empty reply, since tool blocks are hidden.
 */
export function brokenRequests(text: string): string[] {
  const problems: string[] = [];
  for (const match of text.matchAll(/```step-tool[ \t]*\n([\s\S]*?)(?:```|$)/g)) {
    const body = match[1].trim();
    if (loopRequests('```step-tool\n' + body + '\n```').length) continue;
    try {
      const r = JSON.parse(body);
      problems.push(
        !r || !LOOP_TOOLS.includes(r.tool)
          ? `unknown tool ${JSON.stringify(String(r?.tool ?? '')).slice(0, 60)}`
          : 'invalid fields or a value over its size limit (input 2000, content 200000 characters, args 30000)',
      );
    } catch (error) {
      problems.push('invalid JSON: ' + String((error as Error).message).slice(0, 200));
    }
  }
  return problems;
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
