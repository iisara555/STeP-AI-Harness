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
 * googleusercontent.com. Only {ok:true,id} counts as accepted.
 */
export async function submitSkill(
  url: string,
  submission: SkillSubmission & { appVersion: string },
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
  if (!response.ok || !answer || answer.ok !== true || typeof answer.id !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(answer.id))
    throw new Error(answer && answer.ok === false ? code + '_REJECTED' : code + '_FAILED');
  return { reference: answer.id };
}
