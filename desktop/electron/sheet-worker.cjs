const { parentPort, workerData } = require('node:worker_threads');
const ExcelJS = require('exceljs');
const { boundedZip, editWorkbook, createWorkbook, createPresentation, coord } = require('./office-package.cjs');
globalThis.fetch = async () => {
  throw new Error('network-disabled');
};
const cell = value => {
  try {
    coord(value);
    return true;
  } catch {
    return false;
  }
};
(async () => {
  try {
    if (workerData.operation) {
      const create =
        workerData.operation === 'sheet_create' ? createWorkbook : workerData.operation === 'slides_create' ? createPresentation : null;
      if (!create) throw new Error('INVALID_INPUT');
      parentPort.postMessage(await create(workerData.spec));
      return;
    }
    if (workerData.edits !== undefined) {
      parentPort.postMessage(await editWorkbook(Buffer.from(workerData.bytes), workerData.sheet, workerData.edits));
      return;
    }
    await boundedZip(Buffer.from(workerData.bytes));
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(workerData.bytes));
    const { sheet, range } = workerData;
    const ws = typeof sheet === 'string' ? book.getWorksheet(sheet) : book.worksheets[0];
    if (!ws) throw new Error('SHEET_NOT_FOUND');
    {
      const parts = String(range || 'A1:J20').split(':');
      if (parts.length > 2 || parts.some(p => !cell(p))) throw new Error('INVALID_INPUT');
      const from = ws.getCell(parts[0]),
        to = ws.getCell(parts[1] || parts[0]);
      if (to.row < from.row || to.col < from.col || (to.row - from.row + 1) * (to.col - from.col + 1) > 500)
        throw new Error('SHEET_RANGE_LIMIT');
      const rows = [];
      const formulas = [];
      let characters = 0;
      for (let r = from.row; r <= to.row; r++) {
        const row = [];
        for (let c = from.col; c <= to.col; c++) {
          const text = ws.getCell(r, c).text;
          const value = ws.getCell(r, c);
          if (value.formula) formulas.push({ cell: value.address, formula: value.formula, cachedResult: value.result ?? null });
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
        formulas,
        cacheStatus: 'not-verified',
        rowCount: ws.rowCount,
        columnCount: ws.columnCount,
      });
    }
  } catch (e) {
    parentPort.postMessage({ error: /^[A-Z_]+$/.test(e.message) ? e.message : 'SHEET_READ_FAILED' });
  }
})();
