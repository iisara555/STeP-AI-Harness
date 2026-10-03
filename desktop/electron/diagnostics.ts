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
  [/context.{0,25}(?:length|window|exceed)|prompt.{0,15}too long|maximum.{0,15}tokens/i, 'PROMPT_TOO_LONG'],
  // Since 18 June 2026 Google serves Gemini CLI only to API keys and Code Assist Standard/Enterprise licenses.
  [/no longer supported for Gemini Code Assist for individuals|IneligibleTier|migrate to the Antigravity/i, 'GEMINI_PERSONAL_DISCONTINUED'],
  [/GOOGLE_CLOUD_PROJECT/i, 'GOOGLE_CLOUD_PROJECT_REQUIRED'],
  // The model's reply ended before it was complete or came back empty (seen with Gemini when a turn stalls on a tool
  // call): a fresh attempt usually works.
  [
    /invalid chunk|missing finish reason|empty response|MALFORMED_FUNCTION_CALL|finish.?reason.{0,20}(?:MALFORMED|OTHER)/i,
    'PROVIDER_EMPTY_RESPONSE',
  ],
  // Exhausted quota or plan limits do not pass by waiting a few seconds; a busy or rate-limited service usually does.
  [/RESOURCE_EXHAUSTED|quota|usage.?limit|usageLimitExceeded|out of extra usage/i, 'PROVIDER_QUOTA'],
  [
    /overloaded|\b50[234]\b|\b529\b|service unavailable|temporarily unavailable|rate_limit_error|rate.?limit|too many requests|\b429\b/i,
    'PROVIDER_BUSY',
  ],
  [
    /model.{0,40}(?:not supported|not available|does not exist|not found)|not available on your plan|unsupported model/i,
    'MODEL_NOT_AVAILABLE',
  ],
  [
    /token (?:has )?expired|refresh token|not logged in|login required|authentication required|re-?authenticate|invalid_grant|unauthorized|\b401\b|authentication_failed/i,
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
