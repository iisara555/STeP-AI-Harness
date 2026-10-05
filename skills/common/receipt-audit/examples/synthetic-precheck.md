# Synthetic pre-check: conflicting readings are not verified facts

All entities, identifiers and amounts below are synthetic. This is a worked answer,
not a provider evaluation, real-document benchmark or finance rule.

## Input

- Document reference: `RECEIPT-SYN-01`; merchant: ร้านสังเคราะห์ทดสอบ
- OCR total: 107.00 (`EXTRACTED_UNVERIFIED`)
- Vision total: 108.00 (`EXTRACTED_UNVERIFIED`)
- A person has not yet compared either value against the document.
- Subtotal 100.00 and VAT 7.00 are also unverified readings.
- Current verified finance policy and contextual approval evidence are unavailable.

## Good output

| Check | Status | Evidence | Source | Next action |
| --- | --- | --- | --- | --- |
| Document facts | NEED-INFO | OCR reads 107.00; vision reads 108.00. Both remain EXTRACTED_UNVERIFIED. | RECEIPT-SYN-01, conflicting extraction | Owner compares the source and records the selected/corrected value. |
| Arithmetic | FLAG | Reading 100.00 + reading 7.00 gives 107.00; this conflicts with the 108.00 candidate. This conditional calculation does not prove the paid total. | Unverified candidates above | Check all three printed amounts; do not silently replace a candidate. |
| Cross-document match | NEED-INFO | No approval/PO/other contextual evidence supplied. | Not supplied | Ask the owner for relevant context; do not invent a compulsory document set. |
| Policy requirement | NEED-SOURCE | No current verified finance rule for the requested completeness/eligibility decision. | finance-disbursement-policy unavailable | Ask AFP for the applicable current source and checklist. |

Overall: `NEEDS-MORE-EVIDENCE`; the independent policy gap also remains
`NEEDS-CURRENT-SOURCE`. This is not reimbursement approval.

Only the selected value explicitly compared with `RECEIPT-SYN-01` may become
`SOURCE_FACT`. Other readings remain `EXTRACTED_UNVERIFIED`. A manual entry without
source comparison is `USER_INPUT`. Neither OCR confidence, agreement, nor consent
to transmit establishes accuracy or financial authority.

## Why this is good

The answer exposes the disagreement without choosing/averaging a number, keeps
conditional arithmetic separate from facts, and requests both document evidence
and policy authority. A generic answer often declares 107.00 the "correct" total
and claims readiness just because arithmetic balances.
