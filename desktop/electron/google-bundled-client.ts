// Installed-app credentials identify this distribution; they cannot be kept confidential in a native app.
// Only the main bundle receives this build-time value. Employee tokens always belong in the Vault.
declare const __STEP_GOOGLE_DESKTOP_CLIENT__: { clientId: string; clientSecret: string } | null;
const client = typeof __STEP_GOOGLE_DESKTOP_CLIENT__ === 'undefined' ? null : __STEP_GOOGLE_DESKTOP_CLIENT__;

export function bundledGoogleClientSecret(clientId: string): string | undefined {
  return client?.clientId === clientId ? client.clientSecret : undefined;
}
