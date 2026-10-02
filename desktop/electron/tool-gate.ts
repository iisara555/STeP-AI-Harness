import type { PermissionMode, Policy } from './policy';
import { evaluatePermission, type ToolRequest } from './permissions';
import { approvalHash, Approvals } from './approvals';
import type { HookPayload, HookOutcome } from './hooks';

/** Only a reviewed write to one workspace file can be remembered; anything that runs code or acts outside cannot. */
export const rememberableTool = (request: ToolRequest) => request.tool === 'write' && !request.execute && Boolean(request.path);

export class ToolGate {
  constructor(
    private policy: () => Policy,
    private mode: () => PermissionMode,
    private root: () => Promise<string>,
    private approvals: Approvals,
    private hook: (payload: HookPayload) => Promise<HookOutcome>,
  ) {}
  async run<T>(
    request: ToolRequest,
    detail: { title: string; body: string; key: string; privacyClass?: string; sessionId?: string },
    action: () => Promise<T> | T,
    signal?: AbortSignal,
  ): Promise<T | null> {
    if (signal?.aborted) throw new Error('CANCELLED');
    const workspace = await this.root();
    const policy = this.policy();
    const mode = this.mode();
    const check = () => {
      const decision = evaluatePermission(request, this.mode(), this.policy(), { root: workspace });
      if (!decision.allowed)
        throw new Error(
          decision.reason.startsWith('SENSITIVE_PATH')
            ? 'SENSITIVE_PATH'
            : decision.reason.startsWith('PATH_RULE')
              ? 'PATH_RULE_DENIED'
              : decision.reason.startsWith('DENIED_COMMAND')
                ? 'COMMAND_DENIED'
                : 'PLAN_MODE_BLOCKED',
        );
      return decision;
    };
    const decision = check();
    const targetHash = approvalHash(detail.key);
    const metadata = { tool: request.tool, readOnly: request.readOnly, targetHash, sessionId: detail.sessionId };
    const pre = await this.hook({ event: 'pre_tool_use', ...metadata });
    if (pre.blocked) throw new Error('HOOK_BLOCKED');
    const rule = this.approvals.rule(workspace, request.tool, detail.key);
    // Like Claude and ChatGPT: a reviewed file write may be remembered for the same file, because the diff was shown
    // and a snapshot can undo it. Commands, the sandbox and external tool calls ask every time; an older remembered
    // rule for them is ignored. Administrators can turn remembering off.
    const rememberable = rememberableTool(request) && this.policy().permission.rememberApprovals !== false;
    if (decision.requiresConfirmation && !(rememberable && this.approvals.remembered(rule))) {
      const accepted = await this.approvals.request(
        rule,
        {
          title: detail.title,
          body: detail.body,
          privacyClass: detail.privacyClass || 'internal',
          allowRemember: rememberable,
          sessionId: detail.sessionId,
        },
        signal,
      );
      if (!accepted) return null;
    }
    // Re-evaluate after a dialog or hook: neither remembered consent nor auto mode overrides a new denial.
    if (workspace !== (await this.root())) throw new Error('WORKSPACE_CHANGED');
    check();
    if (policy !== this.policy() || mode !== this.mode()) throw new Error('POLICY_CHANGED');
    if (signal?.aborted) throw new Error('CANCELLED');
    try {
      const result = await action();
      const post = await this.hook({ event: 'post_tool_use', ...metadata, ok: true });
      if (post.blocked) throw new Error('HOOK_BLOCKED_AFTER_TOOL');
      return result;
    } catch (error) {
      if (!(error instanceof Error && error.message === 'HOOK_BLOCKED_AFTER_TOOL'))
        await this.hook({ event: 'post_tool_use', ...metadata, ok: false });
      throw error;
    }
  }
}
