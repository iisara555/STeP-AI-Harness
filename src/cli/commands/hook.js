import { resolveRoutingIdentity } from '../../modules/routing-identity.js';
import { queryStepRouter } from '../../modules/router/service.js';

/**
 * `step-ai hook user-prompt-submit`
 *
 * Claude Code runs this before every prompt (UserPromptSubmit hook) and adds what it prints to
 * the model's context. The STeP routing gate then no longer depends on the model choosing to run
 * `step-ai ask`. Routing stays local: the prompt never leaves the machine through this command.
 * It never blocks a prompt: on any failure it asks the model to use the manual gate and exits 0.
 */

const MAX_INPUT = 400_000;

async function readAll(stream) {
  let data = '';
  stream.setEncoding?.('utf8');
  for await (const chunk of stream) {
    data += chunk;
    if (data.length > MAX_INPUT) break;
  }
  return data;
}

function hookOutput(additionalContext) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } });
}

export function routingContext(result) {
  const contract = {
    routing: result.routingContract,
    contextPlan: result.contextPlan,
    privacy: result.privacy,
    ...(result.intentReview ? { intentReview: result.intentReview } : {}),
  };
  return [
    'STeP routing gate (ran locally for this prompt, current turn only).',
    'Use this as the result of `step-ai ask` for this turn and follow its mandatoryReferences; do not run `step-ai ask` again for the same request.',
    'If this prompt answers an earlier STeP clarification question, run `step-ai ask "<original request>" --answer "<answers>" --json` instead, as the workspace instructions describe.',
    '```json',
    JSON.stringify(contract),
    '```',
  ].join('\n');
}

export async function runHook(args, io = {}) {
  const stdin = io.stdin || process.stdin;
  const stdout = io.stdout || process.stdout;
  const env = io.env || process.env;
  if (args._[1] !== 'user-prompt-submit') {
    (io.stderr || process.stderr).write('Supported hook: user-prompt-submit\n');
    return;
  }
  let prompt = '',
    cwd = '';
  try {
    const payload = JSON.parse((await readAll(stdin)) || '{}');
    prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
    cwd = typeof payload.cwd === 'string' ? payload.cwd : '';
  } catch {
    prompt = '';
  }
  if (!prompt) return;
  try {
    // The workspace's USER.md decides the team, as it does for `step-ai ask` run from that folder.
    const workspace = env.CLAUDE_PROJECT_DIR || cwd || process.cwd();
    const identity = await resolveRoutingIdentity(workspace, {});
    const result = await queryStepRouter(prompt, { team: identity.team, cluster: identity.cluster });
    stdout.write(hookOutput(routingContext(result)));
  } catch {
    stdout.write(
      hookOutput(
        'STeP routing gate could not run automatically for this prompt. Run `step-ai ask "<request>" --json` as the workspace instructions describe before doing the work.',
      ),
    );
  }
}
