import { open } from 'node:fs/promises';
import { extname } from 'node:path';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';

export const DOCUMENT_LIMITS = Object.freeze({ bytes: 25 * 1024 * 1024, expandedBytes: 8 * 1024 * 1024,
  characters: 1_000_000, pages: 200, entries: 1000, timeoutMs: 20_000 });
export const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.tsv', '.json', '.yaml', '.yml', '.log']);

export function unavailableDocument(reason, sourceHash = null) {
  return { sourceHash, classification: 'restricted', action: 'human-confirm', canSendToExternalAI: false,
    transmissionAuthorization: 'not-evaluated', requiresHumanConfirmation: true, containsPersonalData: null,
    findings: [], redactionApplied: false, extractionStatus: 'unavailable', reviewReasons: [reason],
    detectionScope: 'text-patterns-only', originalFileSanitized: false };
}

/** Read bounded bytes once, then parse and scan inside a disposable local worker.
 * No original text, document name or parser exception is included in the report.
 * This is a pre-attachment tool, not an interceptor for AI client uploads.
 */
export async function evaluateDocumentPrivacy(file, { includeRedacted = false } = {}) {
  const extension = extname(String(file)).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension) && extension !== '.pdf' && extension !== '.docx') {
    return unavailableDocument('unsupported-file-type');
  }
  let handle;
  let bytes;
  try {
    handle = await open(file, 'r');
    const info = await handle.stat();
    if (!info.isFile()) return unavailableDocument('not-a-regular-file');
    if (info.size > DOCUMENT_LIMITS.bytes) return unavailableDocument('file-size-limit');
    // Bounded even if another process grows the file after stat().
    const buffer = Buffer.alloc(info.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== info.size) return unavailableDocument('file-changed-during-read');
    bytes = new Uint8Array(buffer.subarray(0, offset));
  } catch {
    return unavailableDocument('file-read-failed');
  } finally {
    await handle?.close();
  }
  const sourceHash = createHash('sha256').update(bytes).digest('hex');
  return new Promise((resolve) => {
    let worker;
    let timer;
    let settled = false;
    const finish = async (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      await worker?.terminate();
      resolve({ ...result, sourceHash });
    };
    try {
      worker = new Worker(new URL('./document-worker.js', import.meta.url), {
        workerData: { bytes, extension, includeRedacted, limits: DOCUMENT_LIMITS },
        transferList: [bytes.buffer], execArgv: [], stdout: true, stderr: true,
        resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
      });
      // Third-party diagnostics may quote source content; never forward them.
      worker.stdout.resume();
      worker.stderr.resume();
      timer = setTimeout(() => finish(unavailableDocument('processing-time-limit')), DOCUMENT_LIMITS.timeoutMs);
      worker.once('message', finish);
      worker.once('error', () => finish(unavailableDocument('parser-failed')));
      worker.once('exit', () => finish(unavailableDocument('parser-failed')));
    } catch {
      finish(unavailableDocument('parser-unavailable'));
    }
  });
}
