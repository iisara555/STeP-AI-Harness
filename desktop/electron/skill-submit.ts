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
  if (!SKILL_SUBMIT_URL.test(url)) throw new Error('SKILL_SUBMIT_UNAVAILABLE');
  const body = JSON.stringify(submission);
  if (body.length > 2_500_000) throw new Error('SKILL_SUBMIT_TOO_LARGE');
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
    throw new Error('SKILL_SUBMIT_FAILED');
  }
  const answer = await response.json().catch(() => null);
  if (!response.ok || !answer || answer.ok !== true || typeof answer.id !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(answer.id))
    throw new Error(answer && answer.ok === false ? 'SKILL_SUBMIT_REJECTED' : 'SKILL_SUBMIT_FAILED');
  return { reference: answer.id };
}
