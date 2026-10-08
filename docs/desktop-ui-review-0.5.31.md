# Desktop 0.5.31 UI review follow-up

Scope: PR [#112](https://github.com/iisara555/STeP-AI-Harness/pull/112), its supplied UI findings, and document revisions reported on 8 October 2026. The original PR is included in the release branch; this follow-up implements all remaining proposed items.

| Findings | Result |
| --- | --- |
| A1–A6, A8 | Minimum 11 px text (brand tagline exception), readable colors, composer focus, named landmarks, keyboard resize semantics and focusable terms. |
| A7, A9 | Tool-page level-one headings, including the updated Receipt screen, and context-appropriate AI setup heading levels. |
| A10 | Receipt, Document Tools and Skills UI load as separate chunks with a loading/error state. Vite still reports that the main bundle exceeds 500 kB; this change does not establish a startup performance benchmark. |
| A11, P4 | Theme tokens for disabled controls, syntax, diff indicators, paper backgrounds and shadows. |
| C1–C6 | Plain policy/OCR/Skill availability wording, one action on information-only dialogs, simplified setup and a visible terms reminder. Update DESIGN.md alongside Skill labels. |
| C7–C10 | Readable provider names, two-decimal USD display with four decimals below $0.01, translated table headings, model/reasoning selection in the composer, a connection banner and fewer stacked Settings titles. |
| H1–H6 | Reachable task lists in short windows, localized errors, a fixed release-notes footer, useful empty states and no welcome-screen auto-scroll. |
| H7–H9 | Left-aligned truncated navigation, task actions on hover/focus, and the current page in title-bar search. H8 was already implemented by the existing CSS; the regression checks blur and focus explicitly. |
| P1–P3, P5 | Distinct policy icon, consistent illustration sizes, secondary setup deferral and accepted task-list scrolling. |

## Document revisions

Field replies in a selected document task retain the original Skill, native/working template and source. The current editor structure, including headings and tables, is serialized into the revision prompt after the raw draft passes the privacy check. Inline identifiers are masked before Markdown escaping, including identifiers split across formatting runs. Cross-block redactions fall back to the fully masked plain copy. The latest valid proposal is used when it corresponds to the current editor revision; manual edits take precedence when they change that revision.

New AI document output must carry separate document/review envelopes before becoming a proposal. Malformed conversational responses keep the accepted draft and existing proposal. Saved legacy proposals remain readable. New tasks still clear document task context, and fresh authority checks can block a revision.

Ob-Oon/Witty fragments use stage names only as an internal reasoning aid. They request natural prose without printed style headings or repeated greetings. Document-tool generation uses its Skill and template without conversational personal preferences or speaking-style fragments. A chat display name does not supply the document author or signer.

## Evidence and limits

- Real Electron renderer, synthetic profiles and a local fake provider: five document tools, two consecutive project revisions, manual-edit retention, source retention, separate review, DOCX/PDF export and export-folder creation/cancellation passed.
- Screenshot walk: 24 current screens × light/dark × 1440×900/900×640 = 96 screenshots. axe-core 4.14.0 found zero violations for WCAG 2 A/AA, WCAG 2.1 AA and best-practice tags; no renderer page errors were recorded. Images/reports stay outside the checkout.
- Local checks: root tests 947 passed / 2 skipped; Desktop unit tests 535 passed / 2 skipped; `npm run validate`, formatting/build and all 34 Electron smoke programs passed. Document-tool, native-template and chat smoke checks also passed after the final conversational-preferences exclusion. Native Windows/macOS checks remain in the release workflow.

These checks use synthetic data and controlled providers. They do not certify live-model prose quality, real handwriting accuracy, every Word version, or employee-device performance. Local OCR acceptance remains open. No real receipts, private forms, OCR results or credentials are part of this review artifact; policy defaults remain unchanged.
