# STeP receipt OCR — Gemini API service

**Optional external service, disabled by default.** The owner selected local OCR with no service charges. Desktop defaults to `receiptLocalOnly: true` and ignores this gateway even when its public URL is configured. Employees install the local OCR component once from the receipt page and need no Google sign-in, API key or Cloud Billing. The deployment steps below are for a separately authorized paid-capable integration; they are not required for employee OCR. External receipt workflows require explicit administrator `receiptLocalOnly: false` and can incur both API and hosting charges.

Desktop sends bounded receipt images to this service, authenticated with a verified Google OIDC identity. The Gemini key is held only in Cloud Secret Manager. Employees sign in through the existing Google flow; OCR-only sign-in requests `openid email`, with no Drive, Gmail or Calendar scope. Chat can continue using Antigravity.

This source is not a deployed service. Live Gemini accuracy, signed-in staff acceptance and billing remain unverified. The redesigned four-type/three-answer UI is still a separate prototype; this adapter preserves the current production receipt form and its signature/source evidence.

## Deployment on Google Cloud Run

Run from a reviewed checkout in an authenticated Google Cloud Shell. Choose an approved region and model, enable billing, and create a Native Firestore `(default)` database in an approved location. The script refuses to choose a permanent database location. Cloud Run uses its dedicated service identity to reserve quotas; no service-account key file is required.

Create `step-receipt-gemini-key` and `step-receipt-quota-hmac` in Secret Manager. Paste the Gemini key only into Secret Manager's protected value input, never a command argument, source file, GitHub variable or installer. For the HMAC secret, generate a random value of at least 32 characters. Review existing secrets before reuse; the deployment script only binds them.

Set public configuration in Cloud Shell, then run from the repository root:

```bash
export PROJECT_ID='<authorized Google Cloud project ID>'
export REGION='<approved Cloud Run / Artifact Registry region>'
export GOOGLE_CLIENT_IDS='<Desktop OAuth client ID>'
export GOOGLE_DOMAINS='<verified employee Workspace domain>'
export GEMINI_MODEL='gemini-3.8-flash'
bash gateway/receipt/deploy.sh
```

The public Desktop client ID is in `desktop/electron/google-client.ts` and may belong to a different project from the Gemini key. Match the installed app's client ID exactly. The default employee domain is in `desktop/electron/policy.ts`; additional domains need organization confirmation. Check model availability and structured/image support in the Gemini project. `gemini-3.8-flash` is a starting configuration, not a measured Thai-receipt accuracy winner.

The image builds from `gateway/receipt/Dockerfile`. Its identity receives access to the two named secrets and `roles/datastore.user` for quota storage. The HTTP endpoint is reachable publicly so the application can verify Desktop OAuth ID tokens. `/v1/receipt` rejects missing/invalid signatures, issuer/audience, expired tokens, unverified email and unapproved Workspace domains. Only `/healthz` is unauthenticated. The app uses `X-STeP-Identity` so Cloud Run does not interpret the Desktop-audience token as a Cloud Run IAM token. Do not log this header.

Configure Firestore TTL on `expiresAt` for collection groups `receiptOcrRequests`, `receiptOcrQuota`, `receiptOcrPeople`. Records contain counters, a keyed subject digest and request IDs, never images, receipt text, email or Gemini keys. Without TTL they remain until explicitly removed. TTL deletion is asynchronous; quota days use UTC. Preserve Firestore data across revisions.

## Connect all Desktop installations

After synthetic and authorized real-image acceptance on the deployed URL:

- Set repository Actions **variables** `STEP_RECEIPT_CLOUD_URL` (HTTPS origin returned by Cloud Run) and `STEP_RECEIPT_CLOUD_MODEL` (exact server model). These contain no secret. Installer builds embed them once for all employees, without per-device IT setup or Gemini key entry.
- Existing installations can instead receive managed policy `receiptCloud: {"url":"https://<service-host>","model":"gemini-3.8-flash"}`. `null` disables this routing. A managed origin is an explicit trusted recipient of the Google identity token and image; review it before distributing.
- The receipt page offers **ลงชื่อเข้าใช้ Google สำหรับ OCR** and a masked work-account selector. Before upload it shows the recipient, account, model and up-to-two-reading cost scope. Changed/paused accounts, changed policy, cancellation or denied vision policy stop sending.
- With central routing configured, Desktop never reads a Gemini key or silently falls back to a personal provider. The existing per-user API path is available only when central routing is absent. Outages preserve the source and unconfirmed form.

The deployment script does not release Desktop. Publish only after the owner requests it and CI passes.

## Limits and cost

One request permits up to three full pages and three source-coordinate crops, six images, 4 MB per image / 12 MB combined (16.1 MB JSON body), and at most 16,384 output tokens. The host rejects PDFs over three pages as a whole. One primary read plus at most one numeric recheck means up to two billable Gemini requests per receipt. The service fixes the prompt, schema, model and Google endpoint; callers cannot supply alternate prompts, keys, models or URLs. It creates no explicit prefix cache for receipt images.

Defaults are 200 reserved requests per UTC day across the organization and 20 per employee, four in-flight requests per instance, three Cloud Run instances. Change quotas deliberately for actual volume. Atomic Firestore commit preconditions reserve before generation; parallel instances/restarts cannot reset the allowance. Replayed IDs are rejected, never automatically reissued. Failed/ambiguous requests consume their reserved slot. Usage tokens are returned when Google reports them and retained in local review provenance. Request caps are **not a currency budget**; pricing depends on the [Gemini model](https://ai.google.dev/gemini-api/docs/pricing). Cloud Run, Firestore, builds, registry, secrets and network may also cost money. Quota-store outages fail closed.

## Verification

`cd desktop && npm ci && npm test && npm run build` includes synthetic gateway, signed-token, client, grouping, quota/conflict and identity-scope tests. `node test/receipt-cloud-smoke.mjs` exercises real Electron IPC, encrypted synthetic identity, cancellation, Antigravity-independent OCR, image regions and policy denial against loopback HTTP. The macOS/Windows Electron suite includes it. These checks use no real receipt, paid call or production key.
