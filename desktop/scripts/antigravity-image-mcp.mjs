// Experiment only: serves one synthetic PNG created by the host, never a model-supplied path or URL.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';

const [imagePath, gatePath, evidencePath] = process.argv.slice(2);
const image = readFileSync(imagePath);
if (image.length > 256_000 || image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') process.exit(1);
const content = [{ type: 'image', mimeType: 'image/png', data: image.toString('base64') }];
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const deny = id => send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'IMAGE_NOT_AVAILABLE' }], isError: true } });
let calls = 0;
// Bound each input frame before readline can accumulate it.
let bytes = 0;
process.stdin.on('data', chunk => {
  for (const byte of chunk) {
    bytes = byte === 10 ? 0 : bytes + 1;
    if (bytes > 65_536) process.exit(1);
  }
});
createInterface({ input: process.stdin }).on('line', line => {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } });
  }
  if (!req || typeof req !== 'object' || req.id === undefined) return;
  if (req.method === 'initialize')
    return send({
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: req.params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'step_image_probe', version: '1.0.0' },
      },
    });
  if (req.method === 'ping') return send({ jsonrpc: '2.0', id: req.id, result: {} });
  if (req.method === 'tools/list')
    return send({
      jsonrpc: '2.0',
      id: req.id,
      result: {
        tools: [
          {
            name: 'read_probe_image',
            description: 'View the single synthetic test image. Returns image pixels, not OCR text.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          },
        ],
      },
    });
  if (req.method === 'tools/call') {
    const args = req.params?.arguments === undefined ? {} : req.params.arguments;
    if (
      req.params?.name !== 'read_probe_image' ||
      !args ||
      typeof args !== 'object' ||
      Array.isArray(args) ||
      Object.keys(args).length ||
      !existsSync(gatePath) ||
      calls >= 3
    )
      return deny(req.id);
    calls++;
    writeFileSync(evidencePath, JSON.stringify({ calls, sha256: createHash('sha256').update(image).digest('hex') }), { mode: 0o600 });
    return send({ jsonrpc: '2.0', id: req.id, result: { content, isError: false } });
  }
  return send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not found' } });
});
