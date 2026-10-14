# Employee Google sign-in

Desktop 0.6.6 requires employee identity before opening the workspace. Entry consent, Workspace service
consent and AI accounts are independent. Verify the published installer and update feed before distributing
this version; updating source alone does not update an installed or running application.

## Entry and consent

The Harness-aligned screen uses the existing STeP palette, symbol, illustration and IBM Plex Sans Thai.
It supports Thai/English, light/dark themes, compact windows, keyboard focus, cancellation and actionable errors.
The system browser requests exactly `openid email profile` with online access, account selection, ephemeral
127.0.0.1 loopback, PKCE S256, random state and nonce. Electron validates the Google RS256 signature, issuer,
audience, authorized presenter when supplied, expiry, nonce and verified email. Signed `hd` must equal
`step.cmu.ac.th`; an email suffix alone is insufficient. Profile fields come from the signed ID token.
No UserInfo/Workspace call is needed, and entry discards access/ID tokens rather than retaining Google credentials.

Installed-app OAuth does not support incremental authorization. Selecting Workspace services starts a separate
consent transaction for the selected service scopes. Its Google subject must match employee entry. Existing
Workspace token/Vault safeguards and execution restrictions remain in force; entry itself does not enroll Vault.
AI providers retain their own accounts and entitlements.

## Session and ownership

The private profile contains an atomic, OS-encrypted `employee-session.bin` with an owner binding, identity and
local session timestamps. It contains no Google tokens. Secure Electron safeStorage is required. Corrupted,
oversized, symbolic-linked or hard-linked files fail closed and are not silently replaced.

The default local session lasts 12 hours, including offline use within that interval. Expiry, significant clock
rollback, a different client or a shortened policy lifetime require sign-in again. This does not provide immediate
central revocation while offline; centralized roles, employee removal and audit need a separate online system.

One verified Google `sub` owns one OS profile. Before first binding legacy work, the user explicitly confirms
that its existing chats, documents and connections are theirs. This confirmation does not independently establish
historical ownership. Other subjects cannot enter that profile; different employees should use separate OS
profiles. Entry does not encrypt existing workspace documents or defend against a compromised OS administrator.
If managed policy declares `credentialStorage.sharedDevice: true`, required entry fails closed instead of caching
an identity on a shared OS profile. A private OS profile is required.

Before verification, only login/window operations are registered; workspace storage, providers, tools and
automations initialize afterward. Every workspace IPC call checks the session in Electron main. Sign-out or
expiry hides the workspace, invalidates approvals/credential handles and cancels work, connections and service
operations before reopening login. The pinned owner resumes the existing window, preserving in-memory editor
state. Closing login while a draft is unsaved offers returning to sign-in or explicitly discarding the edit. Sign-out preserves saved work
and provider/Workspace grants, and does not sign out of Google's browser. Service revocation is a separate action.

## Managed configuration

Only a trusted administrator-owned `desktop-policy.json` can change this policy:

```json
{
  "appLogin": {
    "required": true,
    "clientId": "991643024129-1gd4866dn064tm72kjtavsu6qpgpa1hp.apps.googleusercontent.com",
    "sessionHours": 12
  }
}
```

Missing fields retain required entry and the public Desktop client. Integer lifetimes range from 1 through 24
hours. The hosted domain is fixed. An administrator can explicitly disable entry with `required: false`;
malformed/untrusted policy fails closed. Entry policy is independent of Workspace feature/client configuration.
Policy errors also block reuse of a cached employee session until the administrator fixes the policy.
No client secret is bundled. The Google project normally needs Internal audience in the intended organization;
Workspace administrator API controls can still restrict it. Service APIs must be enabled for later service use.

## Verification

Unit tests use generated RSA identities to cover identity-only PKCE, domain/signature denial, encryption,
restart/expiry/clock changes, owner mismatch, legacy adoption, cancellation and policy failures.
`npm run test:employee-login` drives real Electron with synthetic Google responses in a throwaway profile,
checking OS encryption, pre-entry IPC denial, light/dark/English/compact screens, logout/resume and expiry.
Packaged-launch checks expect login and blocked workspace IPC. Packaged apps ignore development smoke bypasses.
No real employee account or model request is used. Real Google consent and employee Windows/macOS acceptance
remain separate validation requirements.

References: [Installed-app OAuth](https://developers.google.com/identity/protocols/oauth2/native-app),
[OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect),
[Google sign-in branding](https://developers.google.com/identity/branding-guidelines).
