---
name: data-privacy-compliance
description: Screen proposed data use, AI inputs, document sharing, and privacy-related support cases for classification, minimization, authorization, and specialist review gaps.
---

# Data Privacy & Compliance

Starter screening workflow, 2026-09-14. Privacy/legal owner and escalation channel: pending confirmation.
This skill is not legal advice, a PDPA compliance certificate, or permission to process data.

## Read before screening

Apply [data classification](../../../rules/data-classification.md), [knowledge policy](../../../docs/knowledge-policy.md), and [secret safety](../../../rules/secret-safety.md).
Use [human approval](../../../rules/human-approval.md) for actions with real-world consequences.
The repository's Public / Internal / Restricted labels are internal handling categories, not statutory legal definitions.

## Workflow

1. Establish purpose, data categories, people affected, source, intended recipients/tool, storage, and requested operation. Inspect only what is necessary and authorized.
2. Classify using the local rules. Unknown classification follows the restricted handling path pending owner review.
3. Identify the smallest useful dataset. Prefer synthetic examples, aggregate results, or redacted extracts. Removing names alone may leave people identifiable.
4. Record the proposed lawful basis, notice, retention, access, deletion route, and any vendor or cross-border processing questions for the authorized privacy owner. Consent is not automatically the correct or only basis.
5. Check whether the proposed AI service and sharing destination are approved for this data class. Unknown vendor handling or authorization blocks uploading the affected data; continue with a safe synthetic example.
6. Produce a screening result and unresolved decisions, without reproducing sensitive values. Recheck current official legal sources before making jurisdiction-specific obligations or deadline claims.

## Decision paths

| Condition | Result | Next step |
|---|---|---|
| Public, necessary, approved destination and purpose | No issue identified in this limited screening | Continue only within the user's requested scope |
| Internal, sharing boundary unclear | Owner review required | Keep internal; identify the missing permission |
| Restricted, secrets, or excessive fields | Restricted handling required | Keep out of this repository and unapproved AI inputs |
| Suspected disclosure or rights request | Specialist escalation required | Use a verified privacy/security contact; minimize further exposure |

For suspected disclosure, preserve necessary evidence in an authorized restricted location, record what is known without copying the exposed data, and prepare an escalation.
Do not destroy evidence, notify regulators, or promise legal outcomes without appropriate authority.
If secrets are involved, follow the linked secret-safety incident instructions.
For access/deletion requests, use the approved identity-verification process and collect only necessary verification data; do not release or delete records on an unverified request.

## Output

- Intended operation and data categories, without raw sensitive values.
- Classification and rationale.
- Proposed minimization or synthetic substitute.
- Gaps: purpose/basis, notice, access, destination/vendor, retention, rights, incident route.
- Screening result, required reviewer, and next safe action.
- Sources, their date/version, and limits of this assessment.

## Example

Input: Upload a meeting transcript and an employee contact list to generate a public FAQ.
Result: Prepare a synthetic or redacted FAQ draft; exclude contact details and unnecessary identifiers.
An internal staff abbreviation reference is not authority to publish a staff directory.
Where a name is genuinely needed in an authorized internal document, use a verified exact match; leave unknown mappings unresolved.

## Acceptance checks

- A request to share "anonymized" rows is checked for indirect identifiers.
- An absent retention rule remains a decision for the owner, not an invented number.
- Restricted content is not copied into a reusable Skill or its examples.
- Screening approval is not presented as legal compliance or permission to send data.

## Sources and adoption

Local policies linked above are the handling baseline, reviewed 2026-09-14.
[PDPC GPPC Help Desk terms](https://gppc.pdpc.or.th/wp-content/uploads/GPPC_HelpDesk_TOS-ver.2.pdf), accessed 2026-09-14, provide a service-specific example of purpose and retention communication, not STeP policy or the full law.
Before operational adoption, the authorized privacy/legal owner must supply current applicable law, organization notices, retention schedules, approved vendors, and escalation contacts.
