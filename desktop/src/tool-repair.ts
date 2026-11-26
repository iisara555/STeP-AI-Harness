import { LOOP_TOOLS } from './tools';
import { TOOL_REGISTRY } from './tool-registry';

/**
 * Repairs a parsed step-tool request before it is validated, so a slip a smaller model makes often (Qwen, Flash and
 * other open models) runs instead of costing a turn. Learned from OpenCode's tool-input repair: a repair applies only
 * when the tool's schema settles the meaning, and every repair is reported back to the model so it learns the right
 * form. Repairs never add a permission or change which gates apply: the repaired request is validated and dispatched
 * exactly like one the model wrote correctly.
 *
 * - A tool name another harness uses, when no STeP tool has that name: `read_file` runs files, `bash` runs terminal.
 * - The function-call shape {"name", "arguments"} instead of {"tool", "input", "args"}.
 * - A missing `input` given under the tool's own name for it, such as `path` for files or `query` for web_search.
 * - A known argument written beside `input` instead of inside `args`.
 * - `args` sent as a JSON string; a null optional argument.
 * - "20" where an integer is expected, "true"/"false" where a boolean is, '["a"]' where a list is, and an option in the
 *   wrong letter case.
 */
type Tool = (typeof LOOP_TOOLS)[number];
type Schema = {
  type?: string;
  enum?: readonly string[];
  items?: Schema;
  properties?: Record<string, Schema>;
};

/** Names other harnesses and model trainings use, mapped only when the meaning is the same. */
const ALIASES: Record<string, Tool> = {
  read: 'files',
  read_file: 'files',
  readfile: 'files',
  open_file: 'files',
  view_file: 'files',
  bash: 'terminal',
  shell: 'terminal',
  run_command: 'terminal',
  run_shell_command: 'terminal',
  grep: 'search_files',
  search_file: 'search_files',
  websearch: 'web_search',
  search_web: 'web_search',
  google_search: 'web_search',
  webfetch: 'web_fetch',
  fetch: 'web_fetch',
  fetch_url: 'web_fetch',
  read_skill: 'skill',
  load_skill: 'skill',
  get_skill: 'skill',
  read_reference: 'reference',
  get_reference: 'reference',
  read_document: 'reference',
  ask: 'ask_user',
  ask_question: 'ask_user',
  ask_followup_question: 'ask_user',
  question: 'ask_user',
  str_replace: 'patch',
  edit: 'patch',
  edit_file: 'patch',
  write: 'changes',
  write_file: 'changes',
  create_file: 'changes',
  run_js: 'repl_eval',
  eval_js: 'repl_eval',
  javascript: 'repl_eval',
  save_artifact: 'artifact_save',
  create_artifact: 'artifact_save',
  read_artifact: 'artifact_read',
  get_artifact: 'artifact_read',
  subagent: 'invoke_subagent',
  gworkspace: 'google_workspace',
  file_read: 'files',
  file_write: 'changes',
  file_edit: 'patch',
  shell_run: 'terminal',
  find_files: 'search_files',
  list_files: 'files',
};

/** Where a model puts the target when it forgets `input`, per tool. Only these names are read, only when input is missing. */
const INPUT_NAMES: Partial<Record<Tool, string[]>> = {
  files: ['path', 'file_path', 'file', 'filename'],
  doc_outline: ['path', 'file_path', 'file'],
  doc_section: ['path', 'file_path', 'file'],
  sheet_read: ['path', 'file_path', 'file'],
  sheet_edit: ['path', 'file_path', 'file'],
  sheet_create: ['path', 'file_path', 'file'],
  slides_create: ['path', 'file_path', 'file'],
  patch: ['path', 'file_path', 'file'],
  changes: ['path', 'file_path', 'file'],
  skill: ['skill', 'name', 'id', 'skill_id'],
  reference: ['id', 'document', 'document_id', 'doc'],
  web_search: ['query', 'q'],
  web_fetch: ['url'],
  web_extract: ['url'],
  browser: ['url'],
  terminal: ['command', 'cmd'],
  ask_user: ['question', 'text'],
  session_search: ['query', 'q'],
  read_remaining: ['id', 'result_id'],
  google_workspace: ['operation', 'op', 'method'],
  artifact_save: ['id', 'title', 'name'],
  artifact_read: ['id', 'name'],
  repl_eval: ['code', 'script'],
  code_symbols: ['path', 'file_path', 'file', 'query'],
  code_references: ['symbol', 'path', 'file_path'],
  code_diagnostics: ['path', 'file_path', 'file'],
  invoke_subagent: ['prompt', 'task', 'question'],
};

/** Argument names other harnesses use for the same field, per tool. */
const ARG_NAMES: Partial<Record<Tool, Record<string, string>>> = {
  patch: { old_str: 'old_string', new_str: 'new_string', oldString: 'old_string', newString: 'new_string' },
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function toolName(value: unknown): Tool | undefined {
  if (typeof value !== 'string') return undefined;
  if ((LOOP_TOOLS as readonly string[]).includes(value)) return value as Tool;
  const key = value
    .trim()
    .toLowerCase()
    .replace(/^(?:functions|tools?|step_host|default_api)[.:]/, '')
    .replace(/[\s.-]+/g, '_');
  if ((LOOP_TOOLS as readonly string[]).includes(key)) return key as Tool;
  return ALIASES[key];
}

/** One argument against its published schema. Returns the value unchanged when no repair is certain. */
function coerce(value: unknown, schema: Schema): unknown {
  if (typeof value !== 'string') return value;
  if (schema.type === 'integer' && /^-?\d{1,15}$/.test(value.trim())) return Number(value.trim());
  if (schema.type === 'boolean' && /^(?:true|false)$/i.test(value.trim())) return value.trim().toLowerCase() === 'true';
  if (schema.type === 'array' && value.trim().startsWith('[')) {
    const parsed = parseJson(value);
    if (Array.isArray(parsed)) return schema.items ? parsed.map(item => coerce(item, schema.items!)) : parsed;
  }
  if (schema.type === 'object' && value.trim().startsWith('{')) {
    const parsed = parseJson(value);
    if (isRecord(parsed)) return parsed;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    const match = schema.enum.filter(option => option.toLowerCase() === value.trim().toLowerCase());
    if (match.length === 1) return match[0];
  }
  return value;
}

export type Repaired = { value: unknown; notes: string[] };

/** Repair a parsed request; anything that is not a request comes back unchanged with no notes. */
export function repairToolRequest(parsed: unknown): Repaired {
  if (!isRecord(parsed)) return { value: parsed, notes: [] };
  const notes: string[] = [];
  let request: Record<string, unknown> = { ...parsed };

  // The function-call shape: {"name": "skill", "arguments": {"input": "...", ...}} (arguments may be a JSON string).
  if (request.tool === undefined && toolName(request.name)) {
    const raw = request.arguments ?? request.parameters ?? request.args;
    const call = typeof raw === 'string' ? parseJson(raw) : raw;
    if (raw === undefined || isRecord(call)) {
      const { name, arguments: _a, parameters: _p, args: _g, ...rest } = request;
      const fields = isRecord(call) ? call : {};
      const { input, content, args, ...named } = fields;
      request = {
        ...rest,
        tool: name,
        ...(input !== undefined ? { input } : {}),
        ...(content !== undefined ? { content } : {}),
        args: { ...(isRecord(args) ? args : {}), ...named },
      };
      notes.push('read a {"name","arguments"} function call as a step-tool request');
    }
  }

  const tool = toolName(request.tool);
  if (!tool) return { value: parsed, notes: [] };
  if (tool !== request.tool) {
    notes.push(`ran ${tool} for "${String(request.tool).slice(0, 60)}"`);
    request.tool = tool;
  }
  const properties: Record<string, Schema> = (TOOL_REGISTRY[tool]?.inputSchema.properties.args as Schema | undefined)?.properties ?? {};

  if (typeof request.args === 'string') {
    const args = parseJson(request.args);
    if (isRecord(args)) {
      request.args = args;
      notes.push('read args sent as a JSON string');
    }
  }
  if (request.args === null) {
    delete request.args;
    notes.push('dropped args: null');
  }
  // Arguments that are not an object (a list, a number) are left for the schema to refuse.
  if (request.args !== undefined && !isRecord(request.args)) return { value: request, notes };
  const args: Record<string, unknown> = isRecord(request.args) ? { ...request.args } : {};

  if (typeof request.input === 'number' || typeof request.input === 'boolean') {
    request.input = String(request.input);
    notes.push('input sent as text');
  }
  if (request.input === undefined) {
    if (typeof args.input === 'string') {
      request.input = args.input;
      delete args.input;
      notes.push('input moved out of args');
    } else {
      for (const name of INPUT_NAMES[tool] ?? []) {
        const top = request[name],
          inner = args[name];
        const value = typeof top === 'string' ? top : typeof inner === 'string' ? inner : undefined;
        if (value === undefined) continue;
        request.input = value;
        if (typeof top === 'string') delete request[name];
        else delete args[name];
        notes.push(`input taken from "${name}"`);
        break;
      }
      if (request.input === undefined && tool === 'google_workspace' && args.action === 'list') {
        request.input = '';
        notes.push('defaulted empty input for google_workspace list');
      }
    }
  }
  for (const [from, to] of Object.entries(ARG_NAMES[tool] ?? {})) {
    for (const holder of [request, args]) {
      if (!Object.hasOwn(holder, from) || Object.hasOwn(args, to)) continue;
      args[to] = holder[from];
      delete holder[from];
      notes.push(`"${from}" read as args.${to}`);
    }
  }
  // Known arguments of this tool written beside input belong in args.
  for (const key of Object.keys(request)) {
    if (['tool', 'input', 'content', 'args'].includes(key) || !Object.hasOwn(properties, key) || Object.hasOwn(args, key)) continue;
    args[key] = request[key];
    delete request[key];
    notes.push(`moved "${key}" into args`);
  }
  for (const [key, value] of Object.entries(args)) {
    const schema = properties[key];
    if (!schema) continue;
    // A null option (an enum such as action) is not dropped: the tool's default would be a guess at what was meant.
    if (value === null && !schema.enum) {
      delete args[key];
      notes.push(`dropped null args.${key}`);
      continue;
    }
    const fixed = coerce(value, schema);
    if (fixed !== value) {
      args[key] = fixed;
      notes.push(
        `args.${key} read as ${Array.isArray(fixed) ? 'a list' : typeof fixed === 'string' ? JSON.stringify(fixed) : typeof fixed}`,
      );
    }
  }
  if (tool === 'artifact_save' && request.content === undefined && typeof args.content === 'string') {
    request.content = args.content;
    delete args.content;
    notes.push('moved args.content to content');
  }
  if (tool === 'repl_eval' && request.content === undefined && typeof args.code === 'string') {
    request.content = args.code;
    delete args.code;
    notes.push('moved args.code to content');
  }
  if (Object.keys(args).length) request.args = args;
  else delete request.args;
  return { value: request, notes };
}

/** Requests the parser repaired, with what it changed; read when the result row is written. */
export const repairNotes = new WeakMap<object, string[]>();

/** The note a result row carries, so the model writes the request correctly next time. */
export function repairNote(notes: string[]) {
  return `Your request was repaired before it ran (${notes.join('; ')}). Next time send it in this form: {"tool","input","content"?,"args"?} with the exact tool name and argument types.`;
}
