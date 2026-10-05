// Development runner: use the same mapper, vision prompt/parser, and bounded fill rule as Desktop.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { pathToFileURL } from 'node:url';
import { CodexAdapter } from '../electron/providers';
import { compareField, parseVisionReading, RECEIPT_FIELDS, RECEIPT_VISION_SYSTEM } from '../src/receipt-vision';
import type { Connection } from '../src/types';

const context: any = { window: {} };
runInNewContext(readFileSync(new URL('../../experiments/local-thai-ocr/web/receipt-review.js', import.meta.url), 'utf8'), context);
const mapper = context.window.ReceiptReview;

export function benchmarkReadings(ocr: unknown, visionReply = '') {
  const extracted = mapper.extractReceipt(ocr);
  const vision = visionReply ? parseVisionReading(visionReply).fields : {};
  const ocrFields: Record<string, string> = {},
    aiFields: Record<string, string> = {},
    combined: Record<string, string> = {};
  const ocrReview: string[] = [],
    aiReview: string[] = [],
    combinedReview: string[] = [];
  for (const field of RECEIPT_FIELDS) {
    const spec = extracted.fields[field];
    const guess = !spec.value && spec.candidates[0]?.value;
    ocrFields[field] = spec.value || guess || '';
    aiFields[field] = vision[field]?.value || '';
    combined[field] = aiFields[field] && (!ocrFields[field] || guess) ? aiFields[field] : ocrFields[field];
    // Align flags with field evidence; unrelated page flags are not all attributed to every field.
    const flagged =
      spec.mappingStatus === 'ambiguous' ||
      !ocrFields[field] ||
      extracted.records.some((line: any) => line.needsReview && (spec.sourceTexts || []).includes(line.text));
    if (flagged) ocrReview.push(field);
    if (!aiFields[field]) aiReview.push(field);
    if (flagged || compareField(field, ocrFields[field], aiFields[field]) === 'differ') combinedReview.push(field);
  }
  return {
    ocr: { fields: ocrFields, review: ocrReview },
    vision: { fields: aiFields, review: aiReview },
    combined: { fields: combined, review: combinedReview },
  };
}

async function main() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  const input = JSON.parse(text);
  if (input.action === 'vision') {
    if (input.approveLive !== true) throw new Error('EXPLICIT_LIVE_APPROVAL_REQUIRED');
    const connection = {
      id: 'benchmark',
      provider: 'openai',
      mode: 'subscription',
      executable: input.executable,
      model: input.model || '',
      ready: true,
    } as Connection;
    const reply = await new CodexAdapter().run('อ่านใบเสร็จสังเคราะห์ในภาพแล้วตอบ JSON ตาม system เท่านั้น', connection, {
      cwd: input.cwd,
      env: process.env,
      system: RECEIPT_VISION_SYSTEM,
      images: [{ mime: 'image/png', data: readFileSync(input.image).toString('base64') }],
      signal: AbortSignal.timeout(180_000),
      emit: () => {},
    });
    // Reject malformed output before persisting it.
    parseVisionReading(reply);
    process.stdout.write(JSON.stringify({ reply, provider: 'openai', model: connection.model || 'provider-default', live: true }));
  } else {
    process.stdout.write(JSON.stringify(benchmarkReadings(input.ocr, input.visionReply)));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const code = /^[A-Z][A-Z0-9_:-]{0,100}$/.test(error.message || '') ? error.message : error.name || 'Error';
    console.error('BENCHMARK_HELPER_FAILED: ' + code);
    process.exitCode = 1;
  });
}
