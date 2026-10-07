// Controlled protocol fixture: never contacts an AI provider or reads credentials.
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const step = (tool, input, args) => '```step-tool\n' + JSON.stringify({ tool, input, args }) + '\n```';
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  let result = {};
  if (message.method === 'account/read') result = { account: { type: 'chatgpt' } };
  if (message.method === 'account/rateLimits/read') result = { rateLimits: {} };
  if (message.method === 'model/list') result = { data: [{ model: 'mock-office', defaultReasoningEffort: 'low' }], nextCursor: null };
  if (message.method === 'thread/start') result = { thread: { id: 'mock-thread' } };
  send({ id: message.id, result });
  if (message.method !== 'turn/start') return;
  const path = join(process.cwd(), '.mock-turn-count.json');
  let count = 0;
  try {
    count = JSON.parse(readFileSync(path, 'utf8')).count;
  } catch {}
  count++;
  writeFileSync(path, JSON.stringify({ count }));
  const text = message.params.input.map(item => item.text || '').join('\n');
  let answer =
    'ข้อเสนอ A สองขั้นตอน 100 บาท เทียบกับ B สามขั้นตอน 200 บาท ยังไม่มีหลักฐานความสำเร็จ ผู้ตัดสินใจและกำหนดเวลารอยืนยัน ผู้อ่าน: author-review evidence/gap';
  if (text.includes('office.xlsx')) {
    answer =
      count === 1
        ? step('sheet_create', 'office.xlsx', {
            spec: {
              sheets: [
                {
                  name: 'ข้อมูล',
                  columns: [
                    { label: 'รหัส', type: 'text' },
                    { label: 'ค่าใช้จ่าย', type: 'currency' },
                  ],
                  rows: [
                    ['00123', 100],
                    ['00007', 200],
                  ],
                  formulas: [{ cell: 'B4', formula: 'SUM(B2:B3)' }],
                },
              ],
            },
          })
        : count === 2
          ? step('sheet_read', 'office.xlsx', { sheet: 'ข้อมูล', range: 'A1:B4' })
          : 'office.xlsx applied; ยังไม่ recalculate ใน Excel';
  } else if (text.includes('office.pptx')) {
    answer =
      count === 1
        ? step('slides_create', 'office.pptx', {
            spec: {
              slides: [
                { title: 'ความคืบหน้า', bullets: ['เสร็จแล้วสองขั้นตอน', 'รอยืนยันกำหนดส่ง'], notes: 'ข้อมูลสังเคราะห์' },
                { title: 'ตาราง', table: { headers: ['งาน', 'สถานะ'], rows: [['ทดสอบ', 'ร่าง']] }, notes: 'ข้อมูลสังเคราะห์' },
                {
                  title: 'กราฟ',
                  chart: { type: 'bar', categories: ['รอบแรก', 'รอบสอง'], series: [{ name: 'จำนวน', values: [2, 3] }] },
                  notes: 'ข้อมูลสังเคราะห์',
                },
              ],
            },
          })
        : 'office.pptx applied; visual review ยังไม่รัน';
  }
  send({ method: 'item/agentMessage/delta', params: { delta: answer } });
  send({
    method: 'thread/tokenUsage/updated',
    params: { tokenUsage: { total: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } } },
  });
  send({ method: 'turn/completed', params: { turn: { status: 'completed' } } });
});
