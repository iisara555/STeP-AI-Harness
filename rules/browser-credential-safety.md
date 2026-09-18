# Browser Credential Safety

Browser automation may remember a login only when the user explicitly opts in.

## Storage model

- **Never store a plaintext password, MFA code, recovery code, session cookie, or access token in `.env`, USER.md, MEMORY.md, output/, Skill files, logs, screenshots, or Git.**
- `.env` may store only non-secret settings and a **credential reference**, for example:
  - `STEP_BROWSER_REMEMBER_LOGIN=true`
  - `STEP_BROWSER_CREDENTIAL_PROVIDER=os`
  - `STEP_BROWSER_CREDENTIAL_REF=step:room-booking:user@example.org`
- The actual password must remain in the operating system/browser credential store when the browser runtime supports it.
- A persistent browser session/profile may be reused only when the user opted in and it remains local to that device. Never export or commit the profile.

## First login

1. Open the correct login page.
2. The user enters username/password themselves.
3. MFA/CAPTCHA/recovery challenges remain user-controlled.
4. Ask whether the user wants this device to remember the login.
5. If yes, prefer the browser/OS password manager or authenticated session. Record only the credential reference in local configuration.
6. If secure persistence is unavailable, do not save the password; require manual login next time.

## Subsequent use

- Try an existing authenticated session first.
- If the session has expired, return control to the user for login.
- Never ask the user to paste a password into chat.
- Never reveal, print, copy, summarize, or log a secret retrieved by a credential provider.
- Do not bypass MFA, CAPTCHA, device approval, or security challenge.

## Shared or public devices

Always disable remembered login on shared/public devices. Sign out and remove the local session when the user requests it.

## Submission boundary

Remembered login does **not** imply permission to submit. Any form submission, booking, approval, purchase, or other consequential action still follows `rules/human-approval.md`.
