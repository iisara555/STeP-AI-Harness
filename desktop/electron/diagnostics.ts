// Runtime stderr is kept only to explain connection failures. Lines are scrubbed of anything that
// could identify the user or authenticate as them before they are held, shown or logged.
export function scrub(line: string) {
  return line
    .replace(/\x1b\[[0-9;?<>]*[A-Za-z]/g, '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, '$1?…')
    .replace(/\b(?:ya29\.|1\/\/|sk-|AIza|Bearer\s+)[\w\-.~+/]+=*/g, '<token>')
    .replace(/[A-Za-z0-9_\-+/]{32,}={0,2}/g, '<redacted>')
    .trim()
    .slice(0, 240);
}

// Known provider failures, mapped to codes the interface explains in Thai.
const KNOWN: [RegExp, string][] = [
  [/GOOGLE_CLOUD_PROJECT/i, 'GOOGLE_CLOUD_PROJECT_REQUIRED'],
  [/RESOURCE_EXHAUSTED|\b429\b|quota|rate.?limit|usage.?limit|usageLimitExceeded|out of extra usage/i, 'PROVIDER_QUOTA'],
  [
    /model.{0,40}(?:not supported|not available|does not exist|not found)|not available on your plan|unsupported model/i,
    'MODEL_NOT_AVAILABLE',
  ],
  [
    /token (?:has )?expired|refresh token|not logged in|login required|re-?authenticate|invalid_grant|unauthorized|\b401\b|authentication_failed/i,
    'LOGIN_REQUIRED',
  ],
  [/PERMISSION_DENIED|\b403\b|not (?:eligible|authorized)/i, 'PROVIDER_PERMISSION_DENIED'],
  [/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|getaddrinfo|network error|proxy/i, 'PROVIDER_NETWORK'],
];
export function explainRuntimeFailure(lines: string[]) {
  for (const [pattern, code] of KNOWN) if (lines.some(line => pattern.test(line))) return code;
  return undefined;
}

// A thrown error's code (UPPER_SNAKE message) or UNEXPECTED; only codes reach logs and the interface.
export const errorCode = (error: unknown) => (error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'UNEXPECTED');
