const SECTIONS = [
  'task_state',
  'context_summary',
  'memory_context',
  'workspace_preferences',
  'skill_instructions',
  'routing_contract',
  'conversation',
  'conversation_files',
  'current_draft',
  'source_document',
  'web_evidence',
  'previous_step_draft',
  'request',
  'latest_message',
  'earlier_request',
  'current_message',
  'revision_requests',
  'tool_results',
  'tool_history',
];
const SECTION_TAG = new RegExp(`<(/?)(${SECTIONS.join('|')})\\b`, 'gi');
// Data cannot open or close any trusted prompt section, including across tool turns.
export const fence = (text: string) => String(text || '').replace(SECTION_TAG, '‹$1$2');
export const section = (tag: string, text: string) => `<${tag}>\n${fence(text)}\n</${tag}>`;
