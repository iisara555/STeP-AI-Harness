import { estimateTextTokens } from '../../src/modules/context-budget/index.js';

export type HistoryTurn = { role: string; text: string; files?: string[] };
export const tokens = (text: string): number => estimateTextTokens(text).estimatedTokens;
export const CHECKPOINT_FORMAT = 2;
export const CHECKPOINT_TOKENS = 1800;
const SUMMARY_INPUT_TOKENS = 6000;
const MAX_BATCHES = 12;
// Each batch leaves room for the previous checkpoint and its JSON envelope.
const BATCH_TOKENS = SUMMARY_INPUT_TOKENS - CHECKPOINT_TOKENS - 64;

const FIGURE =
  /(?:ข้อ|มาตรา|เลขที่|หมวด|ที่\s*อว)\s*[\d๐-๙][\d๐-๙.()/]*|(?:พ\.ศ\.|ค\.ศ\.)\s*[\d๐-๙]{4}|\b(?:QM|QP|WI|FM|SD)-[A-Z0-9]{2,8}-\d{1,6}\b|[\d๐-๙]{1,2}\s*(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*[\d๐-๙]{2,4}|[+\-−]?(?:[\d๐-๙]{1,3}(?:,[\d๐-๙]{3})+|[\d๐-๙]+)(?:\.[\d๐-๙]+)?\s*(?:%|บาท|baht|THB|วัน|คน|ชั่วโมง|ชม\.|เดือน|ปี|หน้า|ชุด|รายการ)|[+\-−]?[\d๐-๙]{1,3}(?:,[\d๐-๙]{3})+(?:\.[\d๐-๙]+)?/gi;
const figureKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\s,]/g, '')
    .replace(/−/g, '-')
    .replace(/[๐-๙]/g, digit => String(digit.charCodeAt(0) - '๐'.charCodeAt(0)));

// Compare complete recognized facts so 100 บาท cannot be mistaken for 1,100 บาท.
export function missingFigures(messages: { role?: unknown; text?: unknown }[], summary: string) {
  const known = new Set([...summary.matchAll(FIGURE)].map(match => figureKey(match[0])));
  const missing: string[] = [];
  for (const message of messages) {
    if (message.role !== 'user') continue;
    for (const [raw] of String(message.text || '').matchAll(FIGURE)) {
      const figure = raw.trim();
      const key = figureKey(figure);
      if (known.has(key)) continue;
      known.add(key);
      missing.push(figure);
      if (missing.length === 40) return missing;
    }
  }
  return missing;
}

const EXCERPT_NOTE = '\n[Excerpt. Full text remains in the local transcript.]\n';

/** Keep both ends of an oversized turn, including instructions appended after a long pasted passage. */
function fitText(text: string, limit: number, encode: (value: string) => string, note = EXCERPT_NOTE) {
  if (tokens(encode(text)) <= limit) return text;
  if (tokens(encode(note)) > limit) return '';
  let low = 0;
  let high = text.length - 1;
  while (low < high) {
    const count = Math.ceil((low + high) / 2);
    const fromEnd = Math.floor(count / 2);
    const candidate = text.slice(0, count - fromEnd) + note + text.slice(text.length - fromEnd);
    if (tokens(encode(candidate)) <= limit) low = count;
    else high = count - 1;
  }
  const fromEnd = Math.floor(low / 2);
  return text.slice(0, low - fromEnd) + note + text.slice(text.length - fromEnd);
}

export function checkpointText(text: string, limit: number) {
  // Allow for the escaped JSON record used to update this checkpoint on its next pass.
  return fitText(text, limit, value => JSON.stringify({ role: 'summary', text: value }));
}

function batchTurns(turns: HistoryTurn[], perTurn: number) {
  const batches: string[] = [];
  let batch = '';
  let size = 0;
  for (const turn of turns) {
    const encode = (text: string) => JSON.stringify({ role: turn.role, text }) + '\n';
    const record = encode(fitText(turn.text, perTurn, encode));
    const length = tokens(record);
    if (size + length > BATCH_TOKENS && batch) {
      batches.push(batch);
      batch = '';
      size = 0;
    }
    batch += record;
    size += length;
  }
  if (batch) batches.push(batch);
  return batches;
}

export async function updateCheckpoint(
  turns: HistoryTurn[],
  previous: string,
  summarize: (data: string) => Promise<string>,
  privacy: (data: string) => string,
  signal: AbortSignal,
) {
  let perTurn = BATCH_TOKENS;
  let batches = batchTurns(turns, perTurn);
  // Reduce each turn's excerpt rather than skip the first batches of a long transcript.
  while (batches.length > MAX_BATCHES) {
    if (perTurn === 32) throw new Error('CONTEXT_LIMIT');
    const fairShare = Math.floor(((BATCH_TOKENS - 32) * MAX_BATCHES) / turns.length);
    perTurn = Math.max(32, Math.min(Math.floor(perTurn / 2), fairShare));
    batches = batchTurns(turns, perTurn);
  }
  let checkpoint = checkpointText(previous, CHECKPOINT_TOKENS);
  for (const batch of batches) {
    if (signal.aborted) throw new Error('CANCELLED');
    const prefix = checkpoint ? JSON.stringify({ role: 'summary', text: checkpoint }) + '\n' : '';
    const updated = privacy(await summarize(prefix + batch)).trim();
    if (!updated) throw new Error('CONTEXT_LIMIT');
    checkpoint = checkpointText(updated, CHECKPOINT_TOKENS);
  }
  return checkpoint;
}

export function recentPreview(turns: HistoryTurn[], budget: number) {
  const perTurn = Math.max(0, Math.floor((budget - 2) / turns.length) - 1);
  return turns.map(turn => {
    const encode = (text: string) => JSON.stringify({ ...turn, text });
    const text = fitText(turn.text, perTurn, encode);
    return { ...turn, text: text || (turn.text ? '[Earlier text omitted; full transcript remains local.]' : '') };
  });
}

const REQUIREMENT = /^\s*(?:[-*•]\s*)?(?:ข้อกำหนด|เงื่อนไข|ห้าม|ต้อง|ให้ใช้|ยึด|แก้เฉพาะ|do not\b|must\b|required\b|only\b|use\b)/i;

export function preserveUserFacts(turns: HistoryTurn[], summary: string, limit: number) {
  const sections: string[] = [];
  const figures = missingFigures(turns, summary);
  if (figures.length) {
    const label = 'Exact figures the employee gave (verbatim, kept by the host): ';
    let remaining = Math.floor(limit / 2) - tokens(label);
    const selected: string[] = [];
    for (const figure of figures) {
      remaining -= tokens(figure + '; ');
      if (remaining < 0) break;
      selected.push(figure);
    }
    if (selected.length) sections.push(label + selected.join('; '));
  }

  const requirements = [
    ...new Set(
      turns
        .filter(turn => turn.role === 'user')
        .flatMap(turn => turn.text.split('\n').map(line => line.trim()))
        .filter(line => REQUIREMENT.test(line) && !summary.includes(line)),
    ),
  ];
  if (requirements.length) {
    const label = 'Earlier instructions from the employee (verbatim excerpts; apply later changes):';
    let remaining = limit - tokens(sections.join('\n\n') + label + '\n\n');
    // Keep the first explicit requirement and the most recent ones within the local evidence budget.
    const selected: string[] = [];
    for (const line of [requirements[0], ...requirements.slice(1).reverse()]) {
      if (remaining <= 24) break;
      const excerpt = fitText(line, Math.min(90, remaining - 3), value => value, ' … ');
      selected.push(excerpt);
      remaining -= tokens(excerpt + '\n- ');
    }
    if (selected.length) sections.push(label + '\n- ' + [selected[0], ...selected.slice(1).reverse()].join('\n- '));
  }

  // Spread any remaining budget fairly across distinct substantive user requests (first + up to 5 recent),
  // mirroring agy's CaptureUserRequests so short follow-ups do not shrink a detailed initial instruction.
  const requirementSet = new Set(requirements);
  const rawRequests: string[] = [];
  const seenRequests = new Set<string>();
  for (const turn of turns) {
    if (turn.role !== 'user') continue;
    const trimmed = turn.text.trim();
    if (trimmed.length < 8 || seenRequests.has(trimmed) || requirementSet.has(trimmed) || summary.includes(trimmed)) continue;
    seenRequests.add(trimmed);
    rawRequests.push(trimmed);
  }
  if (rawRequests.length) {
    const picked = rawRequests.length <= 6 ? rawRequests : [rawRequests[0], ...rawRequests.slice(-5)];
    const label = 'Earlier user requests (verbatim excerpts; apply later changes):';
    const remaining = limit - tokens(sections.join('\n\n') + (sections.length ? '\n\n' : '') + label + '\n- ');
    if (remaining > 32) {
      const overheadPerItem = tokens('\n- ');
      let pool = Math.max(0, remaining - picked.length * overheadPerItem);
      const indexed = picked.map((text, idx) => ({ idx, text, need: tokens(text) }));
      const allocations = new Array<string>(picked.length).fill('');
      const byShortest = [...indexed].sort((a, b) => a.need - b.need);
      let leftCount = byShortest.length;
      for (const item of byShortest) {
        const fairShare = Math.floor(pool / leftCount);
        const share = Math.min(item.need, fairShare);
        if (share >= 12) {
          const excerpt = fitText(item.text, share, value => value, ' … ');
          if (excerpt) {
            allocations[item.idx] = excerpt;
            pool -= Math.min(pool, tokens(excerpt));
          }
        }
        leftCount--;
      }
      const finalItems = allocations.filter(Boolean);
      if (finalItems.length) sections.push(label + '\n- ' + finalItems.join('\n- '));
    }
  }
  return sections.join('\n\n');
}
