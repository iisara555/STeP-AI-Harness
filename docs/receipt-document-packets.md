# Receipt document packets and FM-AF-014

Employees can prepare one local expense case from **ตรวจใบเสร็จ AFP → ชุดเอกสารและ FM-AF-014**. The case records whether payment has already occurred (reimbursement or advance clearing) or is still awaiting Finance. It does not submit to MIS, approve an expense, determine eligibility or execute a payment.

## Receipt voucher layout

The editable FM-AF-014 draft follows the owner-supplied STeP examples: A4, TH Sarabun New, centered receipt-voucher title, right-aligned agency/date block, recipient/address/received-from fields, a three-column ruled item table, amount in figures and Thai words, and separate blank recipient/payer signature areas. Native Word cells and paragraphs remain editable. Word embeds all four pinned font faces. PDF printing embeds the regular/bold faces locally.

The form identifier/revision/effective date match the active FM-AF-014 V02 entry in `docs/knowledge/mis-master-lists.md`. The printed retention wording follows the supplied V02 examples. This reconstruction is a draft layout, not a newly issued controlled form; the controlled version in MIS remains authoritative. No completed source PDF, personal identity, address or signature is bundled. The sample outputs and native smoke use synthetic values only.

`receipt_voucher` means FM-AF-014. `disbursement_voucher` means a Finance payment voucher. The old `payment_voucher` reading is accepted only as an alias for `receipt_voucher`; old records must never acquire the new disbursement meaning. A disbursement voucher alone is not treated as a receipt in the existing pre-check.

## Local case and source review

- Adding PDF/PNG/JPG files copies their selected bytes into app-owned storage. The original is never changed. Copies are SHA-256-bound; export refuses altered copies and refuses destinations that overwrite selected originals or managed sources.
- A packet supports 40 files, 250 source pages, 25 MB per file and 100 MB total. Password-protected or unreadable PDFs are rejected. Imports are bounded, and a failed batch does not commit a partial source list.
- Employees can reorder files, include/exclude pages, classify mixed PDFs per page and explicitly confirm the selected pages after comparing them with the source. Changing a page's type clears its comparison state. No automatic whole-folder OCR runs.
- Checked receipt reuse is an explicit action bound to the host's current immutable receipt bytes. Only recipient/date/description/amount values and their source link are retained; full OCR text and unrelated fields are not copied into the packet. Existing manual voucher fields are preserved. Prefill never confirms the new voucher.
- Editing voucher content clears its confirmation. Decimal calculations operate in satang and reject malformed values. A document packet never adds invoice, receipt and transfer-slip totals together, because they may describe the same expense.
- Case edits save locally with revision conflict detection. Errors remain visible; the latest saved packet can be reloaded. Removing an attachment removes its managed copy, not the original.

## UI layout and states

The packet view extends ReceiptApp's existing Operate surface, IBM Plex Sans Thai typography and shared STeP yellow/dark theme tokens. Mode buttons keep receipt review and packet preparation together. Wide windows place case details and ordered evidence beside the editable FM-AF-014 draft; at 1050 px and below these become one column, with the draft below the evidence. Page selection and classification expand within each source, while export actions remain after the case content.

The toolbar distinguishes pending edits, saving and locally saved data. Visible errors provide a reload action for the latest saved packet; active operations disable competing case actions. Empty states explain how to start and show when evidence is absent. The final review status distinguishes information awaiting comparison from information compared and awaiting AFP review. Its accompanying copy states that completed comparison is not payment approval. Word draft/template actions sit with the voucher, and the combined PDF action sits with the case summary and evidence status.

## Exports and authority

The combined PDF includes a case summary, evidence index with output page ranges, an optional FM-AF-014 draft and the selected source pages in their chosen order. Original PDF page contents remain vector/text where supplied; image sources are fitted to A4. Interactive PDF actions are removed while visible annotations are retained; signed originals remain separate evidence and a merged copy is not a renewed digital signature.

Page selection assembles a document set; it is not a PDF redaction or metadata-removal tool. Sensitive content must be removed from a separate source copy with an appropriate redaction workflow before that copy is added.

The Word actions export either the current editable draft or a blank template. Blank templates have no invented dates, people, amounts or signatures. The native PDF printer has JavaScript disabled, data-only pinned fonts and no network/file request access. None of these paths calls an AI provider or external OCR service.

Every export is labeled as a draft. `prepared-for-afp` means the listed case/source information has been compared, not that the required evidence or current financial policy has been verified. `paymentApproved` and `policyVerified` remain false. Required attachments depend on the current AFP source and expense scenario.

Workflow references: `docs/knowledge/qp-af-003.md` section 4.2 and `docs/knowledge/qp-af-004.md` Finance procedure. AFP reviews and prepares disbursement vouchers; authorized people approve and execute payments. A dedicated AFP disbursement-voucher draft is a later phase.

## Verification

Run Desktop installation, formatting, unit tests and build. `node test/receipt-packet-smoke.mjs` exercises actual renderer/IPC persistence, source ordering/page selection, confirmation invalidation, Word and combined-PDF exports using synthetic files. Run the existing local receipt smoke to retain OCR/consent behavior. Render the generated DOCX in the target Office application and inspect its pages alongside the PDF; pagination may differ between engines. Synthetic checks do not prove real employee receipt accuracy, live MIS integration or controlled-form acceptance.
