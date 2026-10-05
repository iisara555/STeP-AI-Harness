# Synthetic pre-check: a balanced receipt does not supply a finance policy

Synthetic document reference: `RECEIPT-SYN-02`. A person compared the printed
subtotal 100.00, VAT 7.00 and total 107.00 with the source. Those selected values
are `SOURCE_FACT`, with `verification: human-source-comparison`. The original OCR
candidate total 108.00 remains `EXTRACTED_UNVERIFIED`. No current verified policy
for this expense category or contextual approval evidence is supplied.

## Good output

| Check | Status | Evidence | Source | Next action |
| --- | --- | --- | --- | --- |
| Document facts | PASS | Selected amounts were checked against the document. This does not establish its authenticity. | RECEIPT-SYN-02, human source comparison | Retain the document for AFP review. |
| Arithmetic | PASS | 100.00 + 7.00 = 107.00 (`DERIVED_FACT`, based on the selected facts). | RECEIPT-SYN-02 | No internal addition mismatch found. This does not validate VAT treatment. |
| Cross-document match | NEED-INFO | Contextual documents have not been supplied. | Not supplied | Ask for relevant evidence; flag mismatches if subsequently found, not suspected fraud. |
| Policy requirement | NEED-SOURCE | The applicable current finance rule/checklist is unavailable. | finance-disbursement-policy unavailable | Ask AFP to supply/confirm the rule; do not invent a ceiling, buyer identity, tax treatment or required set. |

Overall: `NEEDS-CURRENT-SOURCE`, with a separate evidence gap. Do not say
`READY-FOR-AFP-REVIEW` merely because arithmetic balances, and do not say
"eligible", "approved" or "payment authorized". Final decisions remain with AFP
and the authorized person. Minimize/mask sensitive identifiers in any handoff.

## Why this is good

Human source comparison verifies only the selected transcription. It cannot
promote a different OCR candidate, provide an absent policy, approve an expense,
or prove document authenticity. Named AFP circulars can support their own actual
provisions; they do not fill an unrelated missing category rule from memory.
