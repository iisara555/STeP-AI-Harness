export type DraftNode = { type: string; text?: string; attrs?: { level?: number; start?: number }; marks?: { type: string }[]; content?: DraftNode[] };
export const plainDocument = (text: string): DraftNode => ({ type: 'doc', content: text.split('\n').map(line => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })) });

// Inline Markdown to text runs: bold and italic survive; code, links, and escapes become plain text.
function inline(text: string): DraftNode[] {
  const nodes: DraftNode[] = [], pattern = /(\*\*|__)(.+?)\1|(\*|_)(?!\s)(.+?)(?<!\s)\3|`([^`]+)`|\[([^\]]+)\]\([^)]*\)|\\([\\`*_[\]<>#])/g;
  let last = 0, match: RegExpExecArray | null;
  const push = (value: string, mark?: string) => { if (value) nodes.push(mark ? { type: 'text', text: value, marks: [{ type: mark }] } : { type: 'text', text: value }); };
  while ((match = pattern.exec(text))) {
    push(text.slice(last, match.index));
    if (match[2] !== undefined) push(match[2], 'bold');
    else if (match[4] !== undefined) push(match[4], 'italic');
    else push(match[5] ?? match[6] ?? match[7]);
    last = pattern.lastIndex;
  }
  push(text.slice(last));
  // Adjacent plain runs merge so the editor sees one text node.
  return nodes.reduce<DraftNode[]>((all, node) => { const prev = all.at(-1); if (prev && !prev.marks && !node.marks) prev.text += node.text || ''; else all.push({ ...node }); return all; }, []);
}

// Model output is Markdown; map the subset the draft schema supports and keep everything else as plain paragraphs.
export function markdownDocument(markdown: string): DraftNode {
  const doc: DraftNode = { type: 'doc', content: [] };
  const lists: { node: DraftNode; indent: number }[] = [];
  let fenced = false;
  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; lists.length = 0; continue; }
    if (fenced) { doc.content!.push({ type: 'paragraph', content: raw ? [{ type: 'text', text: raw }] : [] }); continue; }
    const item = /^(\s*)([-*+]|\d{1,4}[.)])\s+(.*)$/.exec(raw);
    if (item && !/^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) {
      const indent = item[1].replace(/\t/g, '  ').length, ordered = /\d/.test(item[2]), type = ordered ? 'orderedList' : 'bulletList';
      while (lists.length && (lists.at(-1)!.indent > indent || (lists.at(-1)!.indent === indent && lists.at(-1)!.node.type !== type))) lists.pop();
      const top = lists.at(-1);
      // A deeper indent nests under the previous item, up to four levels; deeper items stay at the last level.
      if (!top || (top.indent < indent && lists.length < 4)) {
        const list: DraftNode = { type, content: [], ...(ordered ? { attrs: { start: Math.min(Math.max(parseInt(item[2], 10) || 1, 1), 10000) } } : {}) };
        const parent = top?.node.content?.at(-1);
        if (parent) parent.content!.push(list); else doc.content!.push(list);
        lists.push({ node: list, indent });
      }
      lists.at(-1)!.node.content!.push({ type: 'listItem', content: [{ type: 'paragraph', content: inline(item[3]) }] });
      continue;
    }
    lists.length = 0;
    if (!raw.trim() || /^\s*([-*_])(\s*\1){2,}\s*$/.test(raw) || /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(raw)) continue;
    const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw);
    if (heading) { doc.content!.push({ type: 'heading', attrs: { level: Math.min(heading[1].length, 3) }, content: inline(heading[2]) }); continue; }
    // Tables stay readable as one line per row; quotes lose their marker.
    const text = /^\s*\|.*\|\s*$/.test(raw) ? raw.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()).join(' · ') : raw.replace(/^\s*>\s?/, '');
    doc.content!.push({ type: 'paragraph', content: inline(text) });
  }
  return doc;
}

// Accept a bounded schema, never renderer HTML, links, images, or arbitrary attributes.
export function validateDocument(value: unknown): DraftNode {
  let count = 0;
  const visit = (node: any, depth: number): DraftNode => {
    if (++count > 30000 || depth > 16 || !node || typeof node !== 'object') throw new Error('INVALID_DOCUMENT');
    const children: Record<string, string[]> = { doc: ['paragraph', 'heading', 'bulletList', 'orderedList'], paragraph: ['text', 'hardBreak'], heading: ['text', 'hardBreak'], bulletList: ['listItem'], orderedList: ['listItem'], listItem: ['paragraph', 'bulletList', 'orderedList'], text: [], hardBreak: [] };
    if (!Object.hasOwn(children, node.type)) throw new Error('INVALID_DOCUMENT');
    const result: DraftNode = { type: node.type };
    if (node.type === 'text') {
      if (typeof node.text !== 'string' || node.text.length > 150000) throw new Error('INVALID_DOCUMENT');
      result.text = node.text;
      if (node.marks !== undefined) {
        if (!Array.isArray(node.marks) || node.marks.some((m: any) => !m || !['bold', 'italic'].includes(m.type))) throw new Error('INVALID_DOCUMENT');
        result.marks = node.marks.map((m: any) => ({ type: m.type }));
      }
    }
    if (node.type === 'heading') {
      if (![1, 2, 3].includes(node.attrs?.level)) throw new Error('INVALID_DOCUMENT');
      result.attrs = { level: node.attrs.level };
    }
    if (node.type === 'orderedList') {
      const start = node.attrs?.start ?? 1;
      if (!Number.isInteger(start) || start < 1 || start > 10000) throw new Error('INVALID_DOCUMENT');
      result.attrs = { start };
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content) || node.content.some((c: any) => !children[node.type].includes(c?.type))) throw new Error('INVALID_DOCUMENT');
      result.content = node.content.map((c: any) => visit(c, depth + 1));
    }
    return result;
  };
  const doc = visit(value, 0);
  if (doc.type !== 'doc' || documentText(doc).length > 150000) throw new Error('INVALID_DOCUMENT');
  return doc;
}

export function documentText(node: DraftNode): string {
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content || []).map(documentText).join(['paragraph', 'heading'].includes(node.type) ? '' : '\n');
}

export function documentMarkdown(node: DraftNode, indent = ''): string {
  if (node.type === 'text') {
    let text = (node.text || '').replace(/([\\`*_\[\]<>])/g, '\\$1');
    for (const mark of node.marks || []) text = mark.type === 'bold' ? `**${text}**` : `*${text}*`;
    return text;
  }
  if (node.type === 'hardBreak') return '  \n';
  if (node.type === 'bulletList' || node.type === 'orderedList') return (node.content || []).map((item, index) => {
    const prefix = node.type === 'bulletList' ? '- ' : `${(node.attrs?.start || 1) + index}. `;
    const text = (item.content || []).map(child => documentMarkdown(child, indent + '  ')).join('\n');
    return indent + prefix + text.replace(/\n/g, '\n' + indent + '  ');
  }).join('\n');
  const text = (node.content || []).map(child => documentMarkdown(child, indent)).join(['paragraph', 'heading'].includes(node.type) ? '' : '\n\n');
  return node.type === 'heading' ? '#'.repeat(node.attrs?.level || 1) + ' ' + text : text;
}
