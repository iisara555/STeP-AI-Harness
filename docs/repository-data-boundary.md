# Repository Visibility & Data Boundary

**As of:** 2026-09-20  
**Current GitHub visibility:** **PUBLIC**  
**Policy decision:** pending repository owner confirmation before wider organizational rollout.

## Why this matters

A public repository is a public disclosure channel. Access controls described inside Skills, Rules, or README do **not** make tracked Git content private.

Until the repository owner explicitly chooses a different visibility model, every committed file must be treated as public-readable.

## Allowed in the public repository

- application/source code and tests
- generic Skill/Playbook methodology
- synthetic test data
- organization/team/service metadata that is already intentionally public or explicitly approved for publication
- identifiers for controlled sources when exposing the identifier itself has been reviewed as public-safe

## Do not commit to a public repository

- controlled SOP/WI/QA document contents that are not already public
- customer/entrepreneur records or examples containing real PII
- employee personal data, private contact details, performance/HR information
- credentials, tokens, cookies, session material, private keys
- internal-only pricing, budgets, unpublished procurement details, or non-public approval evidence
- confidential partner/vendor material
- internal templates or authority records that have not been approved for public disclosure

## Distribution rule

Employee distribution should use an **organization-approved internal channel**. A public GitHub repository or release being technically downloadable does not make it an approved internal distribution channel.

## Decision required before wider Pilot

Choose one model:

### Model A — Public technical harness
Keep GitHub public, but enforce a strict public-safe boundary. Controlled organization knowledge remains in internal systems and is resolved at runtime by authorized users/connectors.

### Model B — Private organization repository
Move the repository and release artifacts to private/internal access. Before doing so, update installer/updater authentication and release distribution so general staff do not depend on anonymous GitHub access.

Do not mix the two models implicitly.

## Review gate

Before release:
1. confirm repository visibility;
2. confirm release channel;
3. scan tracked content for secrets/PII;
4. review new organization metadata for public-disclosure suitability;
5. keep internal Source of Truth outside the repo unless explicitly approved for publication.
