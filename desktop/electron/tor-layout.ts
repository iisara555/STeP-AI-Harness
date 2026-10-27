import { documentText, type DraftNode } from '../src/draft';
import { DOCUMENT_PRESETS, type DocumentPresentation } from '../src/document-presentation';

// Working STeP layout distilled from the owner-supplied purchase/service TOR examples.
// These are presentation choices, not procurement requirements or approved signing authority.
export const TOR_ORGANIZATION = 'อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่';
export const TOR_LAYOUT = { titleExtra: 2, headerCm: 1, footerCm: 1, logoWidthCm: 3, logoHeightCm: (3 * 60) / 226 };

export function torPreset(presentation: DocumentPresentation) {
  const preset = DOCUMENT_PRESETS[presentation.preset];
  return { ...preset, line: presentation.preset === 'saraban' ? 1.15 : preset.line };
}

export function torSubject(document: DraftNode) {
  const blocks = document.content || [];
  const section = blocks.findIndex((node, index) => index > 0 && node.type === 'heading');
  return blocks
    .slice(0, section < 0 ? blocks.length : section)
    .find(
      node =>
        node.type === 'paragraph' && /^(?:ชื่อ(?:งาน|โครงการ)|(?:งาน)?(?:จัดซื้อ|ซื้อ|จ้าง|เช่า)|โครงการ)/.test(documentText(node).trim()),
    );
}

export function torFooterText(document: DraftNode, presentation: DocumentPresentation) {
  return (
    presentation.footerText ||
    documentText(torSubject(document) || document.content?.[0] || { type: 'paragraph' })
      .replace(/\s+/g, ' ')
      .slice(0, 100)
  );
}

/** Split only the presentation of a supplied numeric label, retaining every character and rich-text mark. */
export function torNumberedBlock(node: DraftNode) {
  if (!['paragraph', 'heading'].includes(node.type)) return undefined;
  const match = /^([0-9๐-๙]+(?:\.[0-9๐-๙]+)+\.?|[0-9๐-๙]+[.)])[ \t]+/.exec(documentText(node));
  if (!match || match[1].length > 32) return undefined;
  const label = match[1],
    level = label.replace(/[.)]$/, '').split('.').length;
  const leftCm = Math.min(level - 1, 4) * 0.6;
  const widthCm = Math.max(0.7, label.length * 0.13 + 0.25);
  let offset = 0;
  const prefix: DraftNode[] = [],
    body: DraftNode[] = [];
  for (const child of node.content || []) {
    const text = child.text || '';
    if (child.type !== 'text') {
      body.push(child);
      continue;
    }
    const split = Math.max(0, Math.min(text.length, match[0].length - offset));
    if (split) prefix.push({ ...child, text: text.slice(0, split) });
    if (split < text.length) body.push({ ...child, text: text.slice(split) });
    offset += text.length;
  }
  return { leftCm, widthCm, prefix: { ...node, content: prefix }, body: { ...node, content: body } };
}
