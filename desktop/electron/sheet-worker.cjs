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
    if (workerData.operation === 'sheet_extract') {
      await boundedZip(Buffer.from(workerData.bytes));
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(Buffer.from(workerData.bytes));
      const MAX_SHEETS = 12;
      const MAX_STAT_ROWS = 5000;
      const MAX_PREVIEW_ROWS = 120;
      const MAX_STAT_COLS = 30;
      const MAX_PREVIEW_COLS = 24;
      const parseNum = raw => {
        if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
        if (typeof raw !== 'string') return null;
        const s = raw.trim();
        if (!s || s.length > 24 || /^0\d{2,}$/.test(s) || /^\d{10,13}$/.test(s)) return null;
        const norm = s
          .replace(/^[฿$€£]\s*/, '')
          .replace(/\s*%$/, '')
          .replace(/,/g, '');
        if (!/^-?\d+(?:\.\d+)?$/.test(norm)) return null;
        const n = Number(norm);
        return Number.isFinite(n) ? n : null;
      };
      const cellDisplay = c => {
        if (c.formula) {
          const res = c.result;
          if (res !== undefined && res !== null && typeof res !== 'object') return String(res);
          if (res && typeof res === 'object' && 'result' in res && res.result !== undefined && res.result !== null)
            return String(res.result);
        }
        return c.text || '';
      };
      const cellNumeric = c => {
        const val = c.formula ? (c.result && typeof c.result === 'object' && 'result' in c.result ? c.result.result : c.result) : c.value;
        if (typeof val === 'number' && Number.isFinite(val)) return val;
        return parseNum(cellDisplay(c));
      };
      const sheets = [];
      for (const ws of book.worksheets.slice(0, MAX_SHEETS)) {
        const rowCount = ws.rowCount || 0;
        const colCount = ws.columnCount || 0;
        const statRows = Math.min(rowCount, MAX_STAT_ROWS);
        const statCols = Math.min(colCount, MAX_STAT_COLS);
        const prevRows = Math.min(rowCount, MAX_PREVIEW_ROWS);
        const prevCols = Math.min(colCount, MAX_PREVIEW_COLS);
        const previewRows = [];
        const headers = [];
        const colAcc = Array.from({ length: statCols }, () => ({ count: 0, nonEmpty: 0, sum: 0, min: Infinity, max: -Infinity }));
        let formulaCount = 0;
        for (let r = 1; r <= statRows; r++) {
          const preview = r <= prevRows ? [] : null;
          let rowHasContent = false;
          for (let c = 1; c <= statCols; c++) {
            const cellObj = ws.getCell(r, c);
            if (cellObj.formula) formulaCount++;
            const text = cellDisplay(cellObj);
            if (text.trim()) rowHasContent = true;
            if (r === 1) headers.push(text.trim() || `คอลัมน์ ${c}`);
            else if (text.trim()) {
              const acc = colAcc[c - 1];
              acc.nonEmpty++;
              const num = cellNumeric(cellObj);
              if (num !== null) {
                acc.count++;
                acc.sum += num;
                if (num < acc.min) acc.min = num;
                if (num > acc.max) acc.max = num;
              }
            }
            if (preview && c <= prevCols) preview.push(text);
          }
          if (preview && (r === 1 || rowHasContent)) previewRows.push(preview);
        }
        const numericStats = [];
        for (let c = 0; c < statCols; c++) {
          const acc = colAcc[c];
          if (acc.count >= 2 && acc.count * 2 >= acc.nonEmpty) {
            numericStats.push({
              column: (headers[c] || `คอลัมน์ ${c + 1}`).slice(0, 60),
              count: acc.count,
              sum: Number(acc.sum.toPrecision(12)),
              avg: Number((acc.sum / acc.count).toPrecision(12)),
              min: acc.min,
              max: acc.max,
            });
          }
        }
        sheets.push({
          name: ws.name,
          rowCount,
          columnCount: colCount,
          previewRows,
          truncatedRows: rowCount > MAX_PREVIEW_ROWS,
          truncatedCols: colCount > MAX_PREVIEW_COLS,
          formulaCount,
          numericStats,
        });
      }
      parentPort.postMessage({ sheets, sheetCount: book.worksheets.length });
      return;
    }
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
