import { documentTool } from '../src/document-tools';
import { documentMarkdown, documentText, type DraftNode } from '../src/draft';

/** Mask contiguous inline text before Markdown escaping can split an identifier. */
export function documentRevisionMarkdown(document: DraftNode, safePlain: string, redact: (text: string) => string): string {
  const visit = (node: DraftNode): DraftNode => {
    if (node.type === 'paragraph' || node.type === 'heading') {
      const raw = documentText(node),
        safe = redact(raw);
      return safe === raw ? node : { ...node, content: safe ? [{ type: 'text', text: safe }] : [] };
    }
    return { ...node, ...(node.content ? { content: node.content.map(visit) } : {}) };
  };
  const safe = visit(document);
  // Cross-block matches or inconsistent legacy state use the fully masked copy, never partially masked structure.
  return documentText(safe) === safePlain ? documentMarkdown(safe) : safePlain;
}

/** Recognize a field reply only within an already selected document task. */
export function isDocumentFieldReply(id: unknown, text: string): boolean {
  const profile = documentTool(id);
  if (!profile) return false;
  const value = text.trim();
  return profile.fields.some(field =>
    field.label.split('/').some(part => {
      const label = part
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/ที่มีหลักฐาน|ที่ตกลงแล้ว/g, '')
        .trim();
      if (!label || !value.startsWith(label)) return false;
      const rest = value.slice(label.length);
      // Thai project/document titles are often entered without a separator.
      return Boolean(rest.trim()) && (field.key === 'title' || /^[\s:：]/.test(rest));
    }),
  );
}

/** Trusted task constraints supplement, rather than replace, the loaded Skill procedures. */
export function documentToolRule(id: unknown, agencyTemplate = false) {
  const p = documentTool(id);
  if (!p) throw new Error('INVALID_DOCUMENT_TOOL');
  // All values come from the host allowlist. Keep literal output tags in this trusted contract;
  // source_document and every untrusted section still fence those tags.
  return (
    '<document_tool_contract>\n' +
    [
      `Selected document: ${p.title}. Primary Skill: ${p.skill}. Follow its structure, workflow, source checks and Human Authority boundaries first.`,
      p.supportSkills.length &&
        `Supporting Skills: ${p.supportSkills.join(', ')}. Use them for document structure and format checks; the primary Skill governs substantive facts.`,
      'The supplied working template is a drafting aid, not a verified current official form. Prefer a source-backed current agency template; if absent, label the draft as using a working template and record the source gap. Example amounts, dates, thresholds and people inside templates are not facts for this task.',
      'When the user selects attachmentRole=template (an agency form/example), use that attachment only for structure and field labels. Filled example people, document numbers, dates, project codes and budgets are not facts of the new task unless separately supplied as current-task facts. If attachmentRole=source, check the extracted source against current form facts and preserve conflicts/provenance. Attachment purpose never grants source verification, approval or authority.',
      agencyTemplate &&
        'The host has a private native DOCX template for this task. Follow its sample-free outline and exact table count/column counts from source_document ahead of the working Markdown template. Use the primary Skill for facts and review; put substantive facts without a dedicated agency field in the closest relevant section instead of dropping them. The exported body uses the current editor content with native template formatting; DOCX rendering remains for review in Word. Do not claim the form revision or facts are verified merely because it was attached.',
      'Form fields in source_document are USER_INPUT, not verified policy or approval. File extraction preserves its own provenance; OCR/AI readings marked EXTRACTED_UNVERIFIED stay unverified until checked against the source by a person. Neither attachment consent nor drafting verifies them.',
      'A formatted form date is a presentation of the original USER_INPUT only. DATE_NEEDS_REVIEW means the date/year is invalid or ambiguous: preserve the reading and use a year/date placeholder in the draft. Never infer a century from a two-digit year. Keep document/reference numbers exactly as supplied.',
      'Return exactly two separate blocks: <document_draft> followed by </document_draft>, then <document_review> followed by </document_review>. Inside document_draft include ONLY the requested editable document: its actual title, fields, body, legitimate tables, signatures and supplied attachments. Inside document_review include ALL Skill-required fact/source checks, unresolved-field lists, working-template caveats and next steps. No conversational introduction, Skill Verification/checklist, explanation of your work or export advice may appear inside document_draft. Do not replace the document with only a checklist or plan. Use Markdown paragraphs and line breaks; do not emit HTML tags such as <br/>.',
      'When current_draft is supplied, revise that document as the base rather than answering the latest message as a new standalone document. Preserve unrequested sections, tables, source identifiers, placeholders and user edits; apply the requested changes in place and return the complete revised document in document_draft. A field reply supplies current-task USER_INPUT, not verification or authority. Keep the selected Skill and agency template structure. Conversational style names, internal style stages, greetings and commentary must not become document headings or body text.',
      'Keep absent facts as [รอยืนยัน: ชื่อช่อง]. Do not invent เลขหนังสือ, budgets, monetary amounts, legal clauses, deadlines, signatures, approvals or meeting resolutions. Mark conflicting form/file facts for review rather than silently choosing one. Suggestions must be separate from agreed facts.',
      'Do not claim DOCX/PDF layout or page-rendering checks were performed during text drafting. State that actual exported-file layout and authority checks remain for review. Do not execute submission, publication, numbering or signing.',
      p.id === 'memo' &&
        'Use the title บันทึกข้อความ and the supplied agency unit label. Follow an attached agency form before the working template. A short memo uses continuous narrative paragraphs, not mandatory four numbered sections. Include optional reviewer/decision signature slots only when supplied in the form/source; leave decision text and signature space blank, never assert approval or choose people. Keep a supplied position/name pair on adjacent separate lines in the signature block.',
      p.id === 'project' &&
        'Use the project-plan proposal workflow: rationale, objectives, target, activities, timeline, source-backed budget, indicators and expected outcomes. Follow the agency DOCX outline when supplied; otherwise use project-proposal-template. Do not substitute a WBS/Gantt-only operational plan.',
      p.id === 'minutes' &&
        'First classify source notes as Decision/Action/Information/Proposal/Open Issue/Risk using meeting-summary. Then organize the minutes by agenda using thai-official-documents; preserve undecided proposals and missing owners/due dates.',
    ]
      .filter(Boolean)
      .join('\n') +
    '\n</document_tool_contract>'
  );
}
