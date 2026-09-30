const { parentPort, workerData } = require('node:worker_threads');
const ExcelJS = require('exceljs');
globalThis.fetch = async () => {
  throw new Error('network-disabled');
};
const cell = value => typeof value === 'string' && /^[A-Z]{1,3}[1-9]\d{0,5}$/.test(value);
const scalar = value =>
  value === null ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && value.length <= 5000);
(async () => {
  try {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(workerData.bytes));
    const { sheet, range, edits } = workerData;
    const ws = typeof sheet === 'string' ? book.getWorksheet(sheet) : book.worksheets[0];
    if (!ws) throw new Error('SHEET_NOT_FOUND');
    if (edits !== undefined) {
      if (!Array.isArray(edits) || !edits.length || edits.length > 200 || edits.some(e => !e || !cell(e.cell) || !scalar(e.value)))
        throw new Error('INVALID_INPUT');
      const before = [],
        after = [];
      for (const e of edits) {
        const c = ws.getCell(e.cell);
        before.push({ cell: e.cell, value: c.text });
        c.value = e.value;
        after.push({ cell: e.cell, value: e.value });
      }
      const output = Buffer.from(await book.xlsx.writeBuffer());
      if (output.length > 8_000_000) throw new Error('FILE_LIMIT');
      const previewBefore = JSON.stringify(before, null, 2),
        previewAfter = JSON.stringify(after, null, 2);
      if (previewBefore.length + previewAfter.length > 200_000) throw new Error('TOOL_OUTPUT_LIMIT');
      parentPort.postMessage({ before: previewBefore, after: previewAfter, binary: output.toString('base64') });
    } else {
      const parts = String(range || 'A1:J20').split(':');
      if (parts.length > 2 || parts.some(p => !cell(p))) throw new Error('INVALID_INPUT');
      const from = ws.getCell(parts[0]),
        to = ws.getCell(parts[1] || parts[0]);
      if (to.row < from.row || to.col < from.col || (to.row - from.row + 1) * (to.col - from.col + 1) > 500)
        throw new Error('SHEET_RANGE_LIMIT');
      const rows = [];
      let characters = 0;
      for (let r = from.row; r <= to.row; r++) {
        const row = [];
        for (let c = from.col; c <= to.col; c++) {
          const text = ws.getCell(r, c).text;
          characters += text.length;
          if (characters > 900_000) throw new Error('TOOL_OUTPUT_LIMIT');
          row.push(text);
        }
        rows.push(row);
      }
      parentPort.postMessage({
        sheet: ws.name,
        sheets: book.worksheets.map(s => s.name).slice(0, 100),
        sheetCount: book.worksheets.length,
        range: parts.join(':'),
        rows,
        rowCount: ws.rowCount,
        columnCount: ws.columnCount,
      });
    }
  } catch (e) {
    parentPort.postMessage({ error: /^[A-Z_]+$/.test(e.message) ? e.message : 'SHEET_READ_FAILED' });
  }
})();
