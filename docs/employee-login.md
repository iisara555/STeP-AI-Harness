# App entry without employee sign-in

Desktop 0.6.8 removes the mandatory Google employee login introduced in 0.6.6. The owner requested direct
workspace access after real OAuth token exchange blocked entry. Opening the app no longer starts employee
OAuth, reads an employee identity record, binds workspace ownership to a Google subject, or locks on session expiry.
Employee sign-out controls and their IPC methods are removed.

Fresh profiles open normal setup. Existing profiles resume their workspace, chats, saved drafts and connections.
The retired `appLogin` policy field is ignored, including `required: true`; it cannot restore the removed gate.
An existing `employee-session.bin` is left untouched and is no longer read or required. No user data is deleted.

Access to local workspace data follows the operating system profile. Use separate OS profiles for separate
employees. This release does not claim employee authentication or centrally enforced account ownership.

Google Workspace connections remain optional and separate from app entry. They retain their OAuth, signed domain,
approval, Vault and managed-policy rules. AI accounts retain their own sign-in. The Windows managed-policy ACL
checker fix from 0.6.7 remains in place.

A token endpoint probe for the configured default client returned HTTP 400 `invalid_request` with a missing
client credential, which the old login UI incorrectly described as an internet failure. Only a deliberately invalid
synthetic code was sent; no employee account, password or token was used. Removing app entry does not repair
optional Workspace OAuth configuration. Its owner must validate the organization-owned Desktop client before use.

Verification: `npm run test:workspace-access` checks fresh and upgraded profiles, retired policy/session data,
retained work, available workspace IPC and absence of employee login/logout. The packaged-launch smoke verifies
the actual DMG opens setup and reaches the workspace with no Google account. All fixtures use temporary profiles.
