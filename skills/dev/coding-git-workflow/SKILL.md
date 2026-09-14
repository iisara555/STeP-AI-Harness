---
name: coding-git-workflow
description: Implement or review scoped code changes with repository discovery, targeted tests, diff review, and safe Git handoff. Use for coding tasks; GitHub-only operations use github-workflow.
---

# Coding & Git Workflow

Starter draft, 2026-09-14. Technical owner and project-specific conventions: pending confirmation.
This skill extends coding verification; [github-workflow](../github-workflow/SKILL.md) remains the source for GitHub collaboration steps.
It applies to developers and maintainers, not as a Git requirement for employees submitting Skill ideas.

## Establish the requested mode

- Plan/explain/review: inspect and report; do not implement or mutate external systems.
- Implement/fix: make the scoped local changes and verify them.
- Publish/merge/deploy: perform only the expressly authorized operation with the applicable approval and checks.

Read repository instructions, [secret safety](../../../rules/secret-safety.md), and [human approval](../../../rules/human-approval.md).
A request to code does not itself authorize production deployment or unrelated cleanup.

## Workflow

1. Locate the repository root and inspect status/diffs if Git exists. If this is a plain directory, report that and continue local work without initializing Git unless requested.
2. Inspect relevant source files, dependency manifests, existing tests, and configured commands. Use the project's conventions rather than prescribing a language, framework, or package manager.
3. State the desired behavior and acceptance criteria. Reproduce the failure when feasible before fixing it.
4. Make the smallest coherent change, preserving existing user edits. If edits conflict with the required change, stop and ask how to handle the overlap.
5. Run relevant available tests, lint, type checks, or build according to impact. For this harness, run `python scripts/validate_repo.py` when changing Skills or configuration.
6. Review the final diff for accidental changes, secrets, generated files, and behavioral regressions. Separate pre-existing failures from new failures using evidence.
7. Return the changed files, observed test results, remaining risks, and next action. Use [github-workflow](../github-workflow/SKILL.md) if the requested handoff includes commits or a PR.

For UI changes, inspect the rendered behavior when tooling is available.
For data migrations or destructive changes, establish the target, recovery plan, and required approval before execution.
Never claim a test passed if it was not run; explain unavailable checks.

## Git handoff

Inspect current repository rules before choosing branch names, commit style, or merge strategy.
Use English for branch names, commit messages, PR text, and code comments unless explicitly instructed otherwise.
Stage only intended changes, and inspect the staged diff before an authorized commit.
Do not reset user work, force-push, alter branch protections, or bypass failed checks without the relevant explicit authority.
Branch protection is a configurable GitHub feature, not evidence that this repository currently has it enabled.

## Output

- Outcome and scope.
- Files changed or review findings with locations.
- Verification: command, observed result, and limitations.
- Known risks and proposed recovery when relevant.
- Git status/actions actually taken; deployment status separately.

## Examples and acceptance checks

- User asks for a plan: return design and test strategy with no implementation.
- User asks to fix one failing unit test: investigate behavior, patch the relevant code/test, run targeted verification, preserve unrelated edits.
- Skill change in this harness: validate frontmatter and references; report structural validation separately from behavioral testing.
- No Git metadata: local changes can be complete, but no commit or branch is claimed.
- Failing required CI: report the blocker; do not disable the check to merge.

## Sources and adoption

Local linked rules and workflow, reviewed 2026-09-14.
[GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), accessed 2026-09-14: reference for configurable review and status-check requirements.
Before adoption, the technical owner should confirm test commands, review requirements, branch conventions, and deployment authority for each repository.
