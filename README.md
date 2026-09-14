# STeP AI Harness

An internal pilot repository for applying shared organizational knowledge, working standards, and repeatable workflows across STeP / RSP North teams.

The harness is designed around three layers:

```text
Organization AI
├── Team Execution
│   └── Skills / Rules / Roles / MCP
│       "Work the way our organization works"
├── Team Context
│   └── Docs / Knowledge / Team Wiki
│       "Know our organization"
└── Team Improvement
    └── Learnings / Sessions / Digest
        "Learn from how the team works"
```

## Pilot status

This repository is a controlled pilot. It provides reusable guidance and draft-generation support. Human owners remain responsible for approvals, official publication, employee decisions, procurement, contracts, production changes, and other actions with real-world impact.

## Repository structure

```text
skills/       Reusable workflows grouped by domain
rules/        Cross-work rules and safety guardrails
manifest/     Team roles and ownership metadata
docs/         Operating guidance, context, and knowledge policy
mcp/          MCP configuration kept disabled by default
scripts/      Repository validation and safety checks
artifacts/    Working document artifacts
output/       Generated drafts and reviewed outputs
```

`artifacts/`, `output/`, `tmp/`, and the staff directory are local or restricted working data and are ignored by default; they are not part of the GitHub source push.

## Organization AI layers

### Team Execution

The execution layer turns organizational working practices into reusable instructions:

- `skills/common/` — shared capabilities such as brand voice, privacy, SOP authoring, customer support triage, official Thai documents, and weekly reviews.
- `skills/creative/` — creative briefs, event concepts, and presentation design.
- `skills/pm/` — project plans, meeting summaries, TOR writing, and TOR review.
- `skills/dev/` — coding, Git, GitHub, and deployment workflows.
- `rules/` — data classification, human approval, naming, secret safety, and writing standards.
- `manifest/roles.yaml` — role definitions for Creative, PM, Developer, and AI Admin.

Skills describe how to perform repeatable work. Rules describe constraints that apply across work. A policy document is not automatically an Agent instruction; it must be reviewed, scoped, and converted into an approved operational rule before automation uses it.

### Team Context

The context layer holds organizational knowledge and references, including:

- `docs/step-context.md` — shared organizational context.
- `docs/roles-and-ownership.md` — roles and ownership.
- `docs/staff-abbreviations.md` — approved staff abbreviation references.
- `docs/knowledge-policy.md` — what may be stored, shared, and retained.
- `STeP-Context-and-Skills-Review.md` — the current context and skills review.
- `HANDOFF.md` — project handoff and operating decisions.

Controlled HR, customer, procurement, contract, personal-data, and other restricted source documents should remain in an approved knowledge location. The repository may contain a sanitized index or approved reference, but should not become an uncontrolled document store.

### Team Improvement

Improvement work is governed by the knowledge lifecycle in `docs/knowledge-policy.md`:

1. Capture a problem, context, and proposed learning.
2. Remove personal and sensitive information.
3. Have the work owner and a second reviewer check it.
4. Promote stable learning into a Skill, Rule, or approved document.
5. Review active guidance every 90 days and archive stale material.

## Skills currently included

The pilot currently contains 18 skills across `common`, `creative`, `pm`, and `dev`. Each skill is stored as a namespaced `SKILL.md` and should define its trigger, workflow, outputs, and completion checks.

Use a skill when the request matches its domain. State the selected skill when the route is not obvious. Combine skills only when each one contributes a distinct part of the work.

Examples:

- Use `skills/pm/tor-review/SKILL.md` to review a TOR.
- Use `skills/common/thai-official-documents/SKILL.md` to check a Thai official document.
- Use `skills/pm/meeting-summary/SKILL.md` to turn meeting notes into an accountable written record.
- Use `skills/common/team-weekly-review/SKILL.md` to structure team progress and follow-up work.

## Organizational Rules source documents

An organizational handbook or HR announcement may be an authoritative policy source, but it is not a direct prompt. Before deriving Agent behavior from one:

- confirm the document owner, version, effective date, scope, and approval status;
- preserve the original source outside the public repository when it is restricted;
- create a rule index with stable IDs and source page references;
- record exceptions, human decision points, and escalation paths;
- require human approval for employee, disciplinary, legal, or other high-impact decisions.

## Safety and approval boundaries

The following controls are enforced by the pilot:

- Recall is disabled by default.
- MCP auto-apply is disabled by default.
- Custom hooks are not auto-applied.
- Secrets, credentials, personal data, and restricted source files must not be committed.
- AI may draft, summarize, classify, and check work, but a human owner must approve real-world actions.

Read `rules/data-classification.md`, `rules/human-approval.md`, and `docs/knowledge-policy.md` before adding organizational material.

## Setup

Requirements:

- Node.js 20 or newer
- Git
- Python 3 for repository validation
- Access to the approved private repository

Install the TeamAI CLI and initialize the harness:

```bash
npm install -g teamai-cli@0.23.1
teamai init https://github.com/iisara555/STeP-AI-Harness.git --scope user
teamai doctor
teamai roles list
```

Select a primary role:

```bash
teamai roles set creative
teamai pull
```

Available roles are `creative`, `pm`, `developer`, and `ai-admin`. A cross-functional contributor may add another role:

```bash
teamai roles set creative --add pm
teamai pull
```

## Validation

Run the repository validator before committing:

```bash
python3 scripts/validate_repo.py
```

The GitHub Actions workflow runs the same validation on pull requests and pushes to `main`.

## Contribution workflow

1. Identify whether the change belongs in a Skill, Rule, Context document, or Improvement record.
2. Keep one authoritative source for each meaning.
3. Use a small, reviewable change.
4. Run the validator and review generated artifacts.
5. Open a pull request for a second reviewer.
6. Merge only after the owner confirms scope, safety, and expected behavior.

## Pilot roadmap

1. Review the current Skills, Rules, roles, and knowledge policy with two maintainers.
2. Trial the harness with 5–10 users from Creative, PM, and Developer roles.
3. Collect real examples, failure cases, and time saved.
4. Improve Skills through reviewed pull requests.
5. Decide whether to enable additional Recall, Dashboard, or MCP capabilities only after privacy and operational review.

See `docs/pilot-operations.md` for the operating plan.
