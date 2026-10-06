import { documentTool } from '../src/document-tools';
import { section } from './prompt';

/** Trusted task constraints supplement, rather than replace, the loaded Skill procedures. */
export function documentToolRule(id: unknown) {
  const p = documentTool(id);
  if (!p) throw new Error('INVALID_DOCUMENT_TOOL');
  return section(
    'document_tool_contract',
    [
      `Selected document: ${p.title}. Primary Skill: ${p.skill}. Follow its structure, workflow, source checks and Human Authority boundaries first.`,
      p.supportSkills.length &&
        `Supporting Skills: ${p.supportSkills.join(', ')}. Use them for document structure and format checks; the primary Skill governs substantive facts.`,
      'The supplied working template is a drafting aid, not a verified current official form. Prefer a source-backed current agency template; if absent, label the draft as using a working template and record the source gap. Example amounts, dates, thresholds and people inside templates are not facts for this task.',
      'Form fields in source_document are USER_INPUT, not verified policy or approval. File extraction preserves its own provenance; OCR/AI readings marked EXTRACTED_UNVERIFIED stay unverified until checked against the source by a person. Neither attachment consent nor drafting verifies them.',
      'A formatted form date is a presentation of the original USER_INPUT only. DATE_NEEDS_REVIEW means the date/year is invalid or ambiguous: preserve the reading and use a year/date placeholder in the draft. Never infer a century from a two-digit year. Keep document/reference numbers exactly as supplied.',
      'Produce the editable draft in the selected document type first, then the Skill-required fact/source checks, unresolved fields and next steps. Do not replace the requested document with only a checklist or plan.',
      'Keep absent facts as [รอยืนยัน: ชื่อช่อง]. Do not invent เลขหนังสือ, budgets, monetary amounts, legal clauses, deadlines, signatures, approvals or meeting resolutions. Mark conflicting form/file facts for review rather than silently choosing one. Suggestions must be separate from agreed facts.',
      'Do not claim DOCX/PDF layout or page-rendering checks were performed during text drafting. State that actual exported-file layout and authority checks remain for review. Do not execute submission, publication, numbering or signing.',
      p.id === 'project' &&
        'Use the project-plan proposal workflow and project-proposal-template: rationale, objectives, target, activities, timeline, source-backed budget, indicators and expected outcomes. Do not substitute a WBS/Gantt-only operational plan.',
      p.id === 'minutes' &&
        'First classify source notes as Decision/Action/Information/Proposal/Open Issue/Risk using meeting-summary. Then organize the minutes by agenda using thai-official-documents; preserve undecided proposals and missing owners/due dates.',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}
