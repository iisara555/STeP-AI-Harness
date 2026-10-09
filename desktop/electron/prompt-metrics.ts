import { createHash } from 'node:crypto';
import { tokens } from './compact';
import type { ProviderCallTrace } from '../src/types';

/** Measures host-supplied text, not runtime-added base instructions, wire encoding or image tokens. */
export function promptMetrics(
  system: string,
  prompt: string,
  blocks: Record<string, string> = {},
): Omit<ProviderCallTrace, 'kind' | 'outcome' | 'ms'> {
  const components: Record<string, number> = {};
  let measuredSystem = 0;
  for (const [key, text] of Object.entries(blocks)) {
    components[key] = tokens(text);
    measuredSystem += components[key];
  }
  components.otherSystem = Math.max(0, tokens(system) - measuredSystem);
  const groups: Record<string, string[]> = {
    history: ['conversation', 'context_summary'],
    sources: ['organization_knowledge', 'source_document', 'conversation_files', 'web_evidence', 'current_draft', 'previous_step_draft'],
    taskState: ['routing_contract', 'task_state'],
    request: ['current_message', 'request', 'latest_message', 'earlier_request', 'revision_requests'],
    toolResults: ['tool_results', 'tool_history'],
    preferences: ['memory_context', 'workspace_preferences'],
  };
  let remainder = prompt;
  for (const match of prompt.matchAll(/<([a-z_]+)>\n[\s\S]*?\n<\/\1>/g)) {
    const group = Object.keys(groups).find(key => groups[key].includes(match[1])) || 'otherPrompt';
    components[group] = (components[group] || 0) + tokens(match[0]);
    remainder = remainder.replace(match[0], '');
  }
  components.otherPrompt = (components.otherPrompt || 0) + tokens(remainder);
  return {
    payloadBytes: Buffer.byteLength(system + prompt, 'utf8'),
    inputEstimate: tokens(system + prompt),
    estimateMethod: 'script-aware-estimate-v2',
    components,
    prefixHash: createHash('sha256').update(system).digest('hex'),
  };
}
