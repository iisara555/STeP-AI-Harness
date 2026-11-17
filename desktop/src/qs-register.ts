// The STeP MIS quality-document register (docs/knowledge/mis-iso-document-register.md) as data: which revision of a
// controlled form is current, and which forms are cancelled. QP-DC-001 keeps the controlled original in MIS; the app
// only reports when a form it prints or a form staff attach does not match the register.

export type RegisterEntry = { code: string; rev?: number; revLabel: string; effective: string; title: string; active: boolean };

/** Table rows of the generated register: | FM-AF-014 | FM | V.02 | 2025-06-01 | ใบสำคัญรับเงิน | ใช้อยู่ | */
export function parseRegister(markdown: string): Map<string, RegisterEntry> {
  const entries = new Map<string, RegisterEntry>();
  for (const line of markdown.split('\n')) {
    const cells =
      /^\|\s*([A-Z]{2}-[A-Z]{2,4}-\d{3}[A-Z]?)\s*\|[^|]*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/.exec(line);
    if (!cells) continue;
    const [, code, revLabel, effective, title, status] = cells;
    const rev = /(\d+)/.exec(revLabel)?.[1];
    entries.set(code, { code, revLabel, effective, title, active: status === 'ใช้อยู่', ...(rev ? { rev: Number(rev) } : {}) });
  }
  return entries;
}

/**
 * The document number and revision a controlled form prints, in either QP-DC-001 style:
 * "FM-QM-001 V.00 วันที่บังคับใช้เอกสาร …" or "Doc. No.: QP-DC-001 / REV.: 01 / EFT. Date: …".
 */
export function formReference(text: string): { code: string; rev?: number } | undefined {
  const compact = text.replace(/[​ ]/g, ' ');
  const withRev = /\b((?:FM|QP|WI|SD|QM)-[A-Z]{2,4}-\d{3}[A-Z]?)\b[^\n]{0,40}?(?:\bV\.?|\bREV\.?\s*:?)\s*([0-9๐-๙]{1,3})(?![0-9๐-๙])/i.exec(
    compact,
  );
  if (withRev)
    return {
      code: withRev[1].toUpperCase(),
      rev: Number(withRev[2].replace(/[๐-๙]/g, d => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)))),
    };
  const bare = /\b((?:FM|QP|WI|SD|QM)-[A-Z]{2,4}-\d{3}[A-Z]?)\b/i.exec(compact);
  return bare ? { code: bare[1].toUpperCase() } : undefined;
}

export type FormRevisionCheck = {
  code: 'form-revision';
  form: string;
  status: 'outdated' | 'cancelled' | 'unregistered';
  used?: string;
  current?: string;
  effective?: string;
};

const label = (rev: number) => 'V.' + String(rev).padStart(2, '0');

/** Undefined when the text names no controlled form, or names the current revision. */
export function formRevisionCheck(text: string, register: ReadonlyMap<string, RegisterEntry>): FormRevisionCheck | undefined {
  const found = formReference(text);
  if (!found) return undefined;
  const entry = register.get(found.code);
  if (!entry) return { code: 'form-revision', form: found.code, status: 'unregistered' };
  if (!entry.active) return { code: 'form-revision', form: found.code, status: 'cancelled', effective: entry.effective };
  if (found.rev !== undefined && entry.rev !== undefined && found.rev < entry.rev)
    return {
      code: 'form-revision',
      form: found.code,
      status: 'outdated',
      used: label(found.rev),
      current: entry.revLabel,
      effective: entry.effective,
    };
  return undefined;
}
