import { googleInvocation, type GoogleRequest } from './google-operations';
import type { GoogleWorkspace } from './google-workspace';
import type { GoogleReadConsent } from './google-read-consent';
import { googleReadRequestConsent } from './google-consent';

type Context = Parameters<GoogleWorkspace['execute']>[2];
type Review = { action: string; redactedText?: string; classification: string };

/** Native read + AI handoff share the employee's one request approval; every result still passes privacy review. */
export async function executeGoogleRead(
  google: GoogleWorkspace,
  account: string,
  input: GoogleRequest,
  request: object,
  consent: GoogleReadConsent,
  context: Context,
  review: (text: string) => Review,
  ask: (detail: ReturnType<typeof googleReadRequestConsent>) => Promise<boolean>,
) {
  const snapshot = structuredClone(input);
  const invocation = googleInvocation(snapshot);
  if (invocation.write) throw new Error('GOOGLE_READ_SCOPE_CHANGED');
  const key = google.requestConsentKey(account);
  const check = async () => {
    await context.check();
    if (context.signal.aborted) throw new Error('CANCELLED');
    if (key !== google.requestConsentKey(account)) throw new Error('GOOGLE_ACCOUNT_CHANGED');
  };
  const result = await google.execute(account, snapshot, {
    ...context,
    check,
    approve: async () => {
      await consent.authorize(
        key,
        () =>
          ask(
            googleReadRequestConsent(
              consent.request,
              consent.destination,
              google.state().accounts.find(a => a.id === account)!.label,
              invocation.preview,
            ),
          ),
        check,
      );
      return true;
    },
  });
  const report = review(JSON.stringify(result));
  if (report.action === 'block-external' || typeof report.redactedText !== 'string') throw new Error('PRIVACY_REVIEW_REQUIRED');
  const reviewed = JSON.parse(report.redactedText);
  await consent.record(request, JSON.stringify(reviewed), check);
  return reviewed;
}
