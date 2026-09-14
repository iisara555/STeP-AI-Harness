---
name: customer-support-faq-triage
description: Draft source-backed FAQ answers and triage incoming STeP service questions or complaints into actionable handoffs, without inventing service terms or sending replies.
---

# Customer Support FAQ & Triage

Starter draft, 2026-09-14. Service owners, routing directory, and service-level targets: pending confirmation.
No approved STeP FAQ database or response-time commitment is established by this skill.

## Inputs

Read [STeP context](../../../docs/step-context.md) and [writing rules](../../../rules/step-writing.md).
Obtain the question, relevant service/project, audience, impact, and available approved service sources.
Use only the personal details needed to handle the case; follow [data classification](../../../rules/data-classification.md).

## Workflow

1. Identify the actual need: information, application/booking, status, technical problem, complaint, or privacy/security concern.
2. Check the applicable official service page or owner-approved FAQ. Record source and verification date; check volatile details before quoting them.
3. If the source answers the question, draft a concise Thai answer with a clear next step. For conflicts, identify the discrepancy and request owner confirmation.
4. If not answerable, ask the minimum clarifying question and draft a handoff. Use a confirmed routing directory, not a guessed employee or team.
5. Assign a provisional impact category using the table below. Distinguish reported facts from inferred impact.
6. Return the reply draft and internal triage note separately. Sending, ticket creation, refunds, and other mutations need authorization appropriate to that action.

Read [brand-tone-of-voice](../brand-tone-of-voice/SKILL.md) for channel-sensitive wording.
For rights requests or suspected disclosure, read [data-privacy-compliance](../data-privacy-compliance/SKILL.md).

## Proposed triage categories

| Category | Evidence | Handling |
|---|---|---|
| Urgent review | Suspected active security/privacy incident or serious safety risk | Flag promptly to a verified responsible human; avoid exposing case data |
| High impact | Reported service blocker or an evidenced imminent deadline | Summarize impact and seek responsible service owner |
| Routine | General question, normal status request, or feature suggestion | Answer from approved sources or draft a standard handoff |

These are draft triage categories, not an approved SLA. Urgency does not authorize bypassing access controls.
Do not assign a response deadline or claim escalation has occurred unless confirmed.

## Output templates

### Reply draft
[Acknowledge the request. Give the verified answer or state the missing detail. Offer the next step.]
Sources: [relevant page or approved document]

### Internal triage
- Category and reported impact:
- Service / issue:
- Known facts / unconfirmed points:
- Proposed destination / whether confirmed:
- Next action and owner confirmation needed:
- Sensitive details excluded:

### Reusable FAQ entry
- Question:
- Answer:
- Source / version / checked date:
- Applicable service and exclusions:
- Content owner / review status:
- Recheck trigger: changed fees, eligibility, schedule, or policy.

## Examples and acceptance checks

- "What is the room booking price?" with no current tariff: ask which facility/date is intended, state that the rate needs confirmation, and avoid inventing a price.
- "Delete my personal data": acknowledge the request and route through a verified privacy procedure; do not delete records from the request alone.
- A complaint about a delayed reply: acknowledge the reported delay without promising a refund or a resolution time.
- An FAQ made from meeting notes excludes internal discussion and unapproved service commitments.
- Drafting a handoff is reported as a draft, never as a sent escalation.

## Basis and adoption

Derived from the linked local context and handling/writing rules, reviewed 2026-09-14.
Before live use, service owners must supply an approved FAQ, contact routing, escalation process, and any SLA.
