import { SKILL_SUBMIT_URL } from './policy';

export type SkillSubmission = {
  schema: 1;
  pack: { id: string; version: string; digest: string; skills: string[] };
  review: { status: string; findings: unknown[] };
  usage: { count: number; lastUsedAt?: string };
  contributor: { name: string; team: string; uploadedAt: string };
  files: { path: string; text: string }[];
};

/**
 * Sends one "เสนอให้องค์กรใช้" submission to the administrators' Apps Script web app (scripts/skill-intake). The body
 * goes as text/plain, which Apps Script reads from e.postData.contents; its answer comes back through a redirect to
 * googleusercontent.com. Only {ok:true,id} counts as accepted. `identity` is the Google ID token of the employee's
 * organization sign-in: the intake verifies it with Google and refuses anything else (no shared secret is in the app).
 */
export async function submitSkill(
  url: string,
  submission: SkillSubmission & { appVersion: string; identity: string },
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch,
  timeoutMs = 30_000,
): Promise<{ reference: string }> {
  return postIntake(url, submission, 2_500_000, 'SKILL_SUBMIT', fetcher, timeoutMs);
}

export const FEEDBACK_CATEGORIES = ['problem', 'idea', 'answer'] as const;
export type FeedbackSubmission = {
  schema: 1;
  kind: 'feedback';
  category: (typeof FEEDBACK_CATEGORIES)[number];
  text: string;
  /** The AI answer the employee chose to attach, after the privacy check. */
  answer?: string;
  /** Empty when the employee chose not to send their name. */
  contributor: { name: string; team: string };
  /** The last error code shown in the task, such as PROVIDER_NETWORK. Never message text. */
  errorCode?: string;
  os: string;
  appVersion: string;
  /** Google ID token of the organization sign-in; verified and rate-limited by the intake, recorded only with a name. */
  identity: string;
};

/** Sends one "แจ้งปัญหา / เสนอแนะ" to the same intake as Skills. Errors are FEEDBACK_SUBMIT_*. */
export async function submitFeedback(
  url: string,
  submission: FeedbackSubmission,
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch,
  timeoutMs = 30_000,
): Promise<{ reference: string }> {
  return postIntake(url, submission, 20_000, 'FEEDBACK_SUBMIT', fetcher, timeoutMs);
}

async function postIntake(
  url: string,
  value: unknown,
  limit: number,
  code: 'SKILL_SUBMIT' | 'FEEDBACK_SUBMIT',
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
  timeoutMs: number,
): Promise<{ reference: string }> {
  if (!SKILL_SUBMIT_URL.test(url)) throw new Error(code + '_UNAVAILABLE');
  const identity = (value as { identity?: unknown }).identity;
  if (typeof identity !== 'string' || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(identity) || identity.length > 8000)
    throw new Error(code + '_SIGN_IN');
  const body = JSON.stringify(value);
  if (body.length > limit) throw new Error(code + '_TOO_LARGE');
  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error(code + '_FAILED');
  }
  const answer = await response.json().catch(() => null);
  if (!response.ok || !answer || answer.ok !== true || typeof answer.id !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(answer.id)) {
    if (!answer || answer.ok !== false) throw new Error(code + '_FAILED');
    // The intake's fixed refusals: an unverified sign-in, this account's daily quota, the shared one.
    if (answer.error === 'IDENTITY') throw new Error(code + '_SIGN_IN');
    if (answer.error === 'SENDER_LIMIT' || answer.error === 'LIMIT') throw new Error(code + '_LIMIT');
    throw new Error(code + '_REJECTED');
  }
  return { reference: answer.id };
}
