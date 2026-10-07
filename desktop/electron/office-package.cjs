// STeP implementation using public library APIs; no third-party Skill code is copied.
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const posix = require('node:path').posix;
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const fail = code => {
  throw new Error(code);
};
const scalar = v =>
  v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 5000);
function coord(value) {
  const m = typeof value === 'string' && /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(value);
  if (!m) fail('INVALID_INPUT');
  const col = [...m[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0),
    row = Number(m[2]);
  if (col > 16384 || row > 1048576) fail('INVALID_INPUT');
  return { col, row };
}
const elements = (doc, tag) => Array.from(doc.getElementsByTagNameNS(NS, tag));
function parse(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail('OFFICE_XML_UNSUPPORTED');
  let invalid = false;
  const doc = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: () => {
        invalid = true;
      },
      fatalError: () => {
        invalid = true;
      },
    },
  }).parseFromString(text, 'application/xml');
  if (invalid || !doc.documentElement) fail('OFFICE_XML_INVALID');
  return doc;
}
async function boundedZip(bytes) {
  if (bytes.length > 8000000) fail('FILE_LIMIT');
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files);
  if (entries.length > 2500 || entries.reduce((n, e) => n + (e._data?.uncompressedSize || 0), 0) > 32000000) fail('OFFICE_PACKAGE_LIMIT');
  if (entries.some(e => e.name.startsWith('_xmlsignatures/') || /vbaProject\.bin$/i.test(e.name))) fail('OFFICE_PACKAGE_UNSUPPORTED');
  return zip;
}
function inRange(address, range) {
  const c = coord(address),
    [a, b = a] = range.replace(/\$/g, '').split(':').map(coord);
  return c.row >= a.row && c.row <= b.row && c.col >= a.col && c.col <= b.col;
}
async function editWorkbook(bytes, sheetName, edits) {
  if (!Array.isArray(edits) || !edits.length || edits.length > 200 || edits.some(e => !e || !scalar(e.value))) fail('INVALID_INPUT');
  const unique = new Set();
  for (const e of edits) {
    coord(e.cell);
    if (unique.has(e.cell)) fail('INVALID_INPUT');
    unique.add(e.cell);
  }
  const zip = await boundedZip(bytes);
  const get = async path => {
    const f = zip.file(path);
    if (!f) fail('OFFICE_XML_INVALID');
    return parse(await f.async('string'));
  };
  const workbook = await get('xl/workbook.xml');
  const sheets = elements(workbook, 'sheet');
  const selected = sheetName === undefined ? sheets[0] : sheets.find(s => s.getAttribute('name') === sheetName);
  if (!selected) fail('SHEET_NOT_FOUND');
  const rels = await get('xl/_rels/workbook.xml.rels');
  const rel = Array.from(rels.getElementsByTagNameNS('*', 'Relationship')).find(
    r => r.getAttribute('Id') === selected.getAttribute('r:id'),
  );
  if (!rel || rel.getAttribute('TargetMode') === 'External') fail('OFFICE_XML_UNSUPPORTED');
  const target = rel.getAttribute('Target');
  const path = target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join('xl', target));
  if (!/^xl\/worksheets\/[\w.-]+\.xml$/.test(path)) fail('OFFICE_XML_UNSUPPORTED');
  const sheet = await get(path),
    data = elements(sheet, 'sheetData')[0];
  if (!data) fail('OFFICE_XML_INVALID');
  const merged = elements(sheet, 'mergeCell').map(m => m.getAttribute('ref'));
  const protectedRanges = elements(sheet, 'f')
    .map(f => f.getAttribute('ref'))
    .filter(Boolean);
  // A protected sheet may specify finer permissions, but the generic editor cannot prove authorization for them.
  if (elements(sheet, 'sheetProtection').length) fail('SHEET_PROTECTED');
  const create = tag => sheet.createElementNS(NS, tag);
  let strings;
  const displayValue = async c => {
    if (!c) return null;
    const type = c.getAttribute('t'),
      value = elements(c, 'v')[0]?.textContent ?? '';
    if (type === 'inlineStr')
      return elements(c, 't')
        .map(t => t.textContent)
        .join('');
    if (type === 's') {
      if (!strings)
        strings = elements(await get('xl/sharedStrings.xml'), 'si').map(si =>
          elements(si, 't')
            .map(t => t.textContent)
            .join(''),
        );
      const index = Number(value);
      if (!Number.isInteger(index) || strings[index] === undefined) fail('OFFICE_XML_INVALID');
      return strings[index];
    }
    if (type === 'b') return value === '1';
    if (type === 'str' || type === 'e') return value;
    return value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : value;
  };
  const before = [],
    after = [];
  for (const e of edits) {
    if (merged.some(r => inRange(e.cell, r) && e.cell !== r.split(':')[0])) fail('MERGED_CELL_PROTECTED');
    let c = elements(sheet, 'c').find(c => c.getAttribute('r') === e.cell);
    if ((c && elements(c, 'f').length) || protectedRanges.some(r => inRange(e.cell, r))) fail('FORMULA_CELL_PROTECTED');
    before.push({ cell: e.cell, value: await displayValue(c) });
    const address = coord(e.cell);
    if (!c) {
      let row = elements(sheet, 'row').find(r => Number(r.getAttribute('r')) === address.row);
      if (!row) {
        row = create('row');
        row.setAttribute('r', String(address.row));
        const next = elements(sheet, 'row').find(r => Number(r.getAttribute('r')) > address.row);
        data.insertBefore(row, next || null);
      }
      c = create('c');
      c.setAttribute('r', e.cell);
      const next = Array.from(row.childNodes).find(n => n.localName === 'c' && coord(n.getAttribute('r')).col > address.col);
      row.insertBefore(c, next || null);
    }
    for (const n of Array.from(c.childNodes)) if (['v', 'is'].includes(n.localName)) c.removeChild(n);
    c.removeAttribute('t');
    if (typeof e.value === 'string') {
      c.setAttribute('t', 'inlineStr');
      const is = create('is'),
        t = create('t');
      t.setAttribute('xml:space', 'preserve');
      t.appendChild(sheet.createTextNode(e.value));
      is.appendChild(t);
      c.insertBefore(is, c.firstChild);
    } else if (e.value !== null) {
      if (typeof e.value === 'boolean') c.setAttribute('t', 'b');
      const v = create('v');
      v.appendChild(sheet.createTextNode(typeof e.value === 'boolean' ? (e.value ? '1' : '0') : String(e.value)));
      c.insertBefore(v, c.firstChild);
    }
    after.push({ cell: e.cell, value: e.value });
  }
  // Include new cells in the worksheet's declared used range.
  const addresses = elements(sheet, 'c').map(c => coord(c.getAttribute('r')));
  const dimension = elements(sheet, 'dimension')[0];
  const columnName = n => {
    let name = '';
    while (n) {
      n--;
      name = String.fromCharCode(65 + (n % 26)) + name;
      n = Math.floor(n / 26);
    }
    return name;
  };
  if (dimension && addresses.length) {
    const bounds = addresses.reduce(
      (b, c) => ({
        minR: Math.min(b.minR, c.row),
        maxR: Math.max(b.maxR, c.row),
        minC: Math.min(b.minC, c.col),
        maxC: Math.max(b.maxC, c.col),
      }),
      { minR: Infinity, maxR: 0, minC: Infinity, maxC: 0 },
    );
    const { minR, maxR, minC, maxC } = bounds;
    dimension.setAttribute('ref', `${columnName(minC)}${minR}:${columnName(maxC)}${maxR}`);
  }
  let calc = elements(workbook, 'calcPr')[0];
  if (!calc) {
    calc = workbook.createElementNS(NS, 'calcPr');
    // calcPr precedes these optional workbook children in the OOXML schema.
    const following = Array.from(workbook.documentElement.childNodes).find(n =>
      [
        'oleSize',
        'customWorkbookViews',
        'pivotCaches',
        'smartTagPr',
        'smartTagTypes',
        'webPublishing',
        'fileRecoveryPr',
        'webPublishObjects',
        'extLst',
      ].includes(n.localName),
    );
    workbook.documentElement.insertBefore(calc, following || null);
  }
  calc.setAttribute('fullCalcOnLoad', '1');
  calc.setAttribute('forceFullCalc', '1');
  calc.setAttribute('calcMode', 'auto');
  zip.file(path, new XMLSerializer().serializeToString(sheet));
  zip.file('xl/workbook.xml', new XMLSerializer().serializeToString(workbook));
  const output = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  if (output.length > 8000000) fail('FILE_LIMIT');
  const previewBefore = JSON.stringify(before, null, 2),
    previewAfter = JSON.stringify(after, null, 2);
  if (previewBefore.length + previewAfter.length > 200000) fail('TOOL_OUTPUT_LIMIT');
  return {
    before: previewBefore,
    after: previewAfter,
    binary: output.toString('base64'),
    recalculation: 'required-in-spreadsheet-application',
    preservation: 'untouched-package-parts',
    humanConfirmed: false,
  };
}
function formula(value) {
  if (typeof value !== 'string' || value.length > 500 || !value.trim()) fail('FORMULA_UNSUPPORTED');
  // Deliberately small local formula language. No strings, links, names, external sheets or dynamic arrays.
  const tokens = value.match(/(?:SUM|AVERAGE|MIN|MAX|COUNT|ROUND|IFERROR)\b|[A-Z]{1,3}[1-9]\d{0,6}|\d+(?:\.\d+)?|[()+*/,:.%\-]/g) || [];
  if (tokens.join('') !== value.replace(/\s/g, '')) fail('FORMULA_UNSUPPORTED');
  for (const token of tokens) if (/^[A-Z]+\d+$/.test(token)) coord(token);
  let i = 0;
  const primary = () => {
    const token = tokens[i++];
    if (token === '+' || token === '-') return primary();
    if (token === '(') {
      expression();
      if (tokens[i++] !== ')') fail('FORMULA_UNSUPPORTED');
    } else if (/^\d+(?:\.\d+)?$/.test(token || '')) {
      /* numeric literal */
    } else if (/^[A-Z]{1,3}\d+$/.test(token || '')) {
      if (tokens[i] === ':') {
        i++;
        if (!/^[A-Z]{1,3}\d+$/.test(tokens[i++] || '')) fail('FORMULA_UNSUPPORTED');
      }
    } else if (['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'ROUND', 'IFERROR'].includes(token)) {
      if (tokens[i++] !== '(') fail('FORMULA_UNSUPPORTED');
      let count = 0;
      do {
        expression();
        count++;
        if (tokens[i] !== ',') break;
        i++;
      } while (true);
      if (tokens[i++] !== ')' || (token === 'IFERROR' && count !== 2) || (token === 'ROUND' && count !== 2)) fail('FORMULA_UNSUPPORTED');
    } else fail('FORMULA_UNSUPPORTED');
    if (tokens[i] === '%') i++;
  };
  const term = () => {
    primary();
    while (['*', '/'].includes(tokens[i])) {
      i++;
      primary();
    }
  };
  const expression = () => {
    term();
    while (['+', '-'].includes(tokens[i])) {
      i++;
      term();
    }
  };
  expression();
  if (i !== tokens.length) fail('FORMULA_UNSUPPORTED');
  return value;
}
async function createWorkbook(spec) {
  if (!spec || !Array.isArray(spec.sheets) || !spec.sheets.length || spec.sheets.length > 10) fail('INVALID_INPUT');
  const book = new ExcelJS.Workbook();
  book.creator = 'STeP';
  book.calcProperties.fullCalcOnLoad = true;
  const names = new Set();
  for (const s of spec.sheets) {
    if (
      typeof s.name !== 'string' ||
      !s.name.trim() ||
      s.name.length > 31 ||
      /[\\/*?:\[\]]/.test(s.name) ||
      names.has(s.name.toLowerCase())
    )
      fail('INVALID_INPUT');
    names.add(s.name.toLowerCase());
    if (!Array.isArray(s.columns) || !s.columns.length || s.columns.length > 30 || !Array.isArray(s.rows) || s.rows.length > 500)
      fail('INVALID_INPUT');
    if (s.rows.some(row => !Array.isArray(row) || row.length !== s.columns.length || row.some(v => !scalar(v)))) fail('INVALID_INPUT');
    if (s.source !== undefined && (typeof s.source !== 'string' || s.source.length > 2000)) fail('INVALID_INPUT');
    const ws = book.addWorksheet(s.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = s.columns.map(c => {
      if (
        !c ||
        typeof c.label !== 'string' ||
        !c.label ||
        c.label.length > 120 ||
        !['text', 'number', 'currency', 'percent'].includes(c.type || 'text')
      )
        fail('INVALID_INPUT');
      return {
        header: c.label,
        width: 24,
        style: { numFmt: { text: '@', number: '#,##0.00', currency: '#,##0.00', percent: '0.00%' }[c.type || 'text'] },
      };
    });
    for (const row of s.rows) ws.addRow(row);
    ws.eachRow(row =>
      row.eachCell(c => {
        c.font = { name: 'IBM Plex Sans Thai', size: 12 };
        c.alignment = { vertical: 'top', wrapText: true };
      }),
    );
    ws.getRow(1).eachCell(c => {
      c.font = { name: 'IBM Plex Sans Thai', size: 12, bold: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
      if (s.source) c.note = `Source: ${s.source}`;
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
    if (s.formulas !== undefined && (!Array.isArray(s.formulas) || s.formulas.length > 200)) fail('INVALID_INPUT');
    const seen = new Set();
    for (const f of s.formulas || []) {
      const c = coord(f.cell);
      if (c.col > s.columns.length || c.row > 502 || c.row === 1 || seen.has(f.cell) || ws.getCell(f.cell).value !== null)
        fail('INVALID_INPUT');
      seen.add(f.cell);
      ws.getCell(f.cell).value = { formula: formula(f.formula) };
      ws.getCell(f.cell).font = { name: 'IBM Plex Sans Thai', size: 12 };
    }
  }
  return output(await book.xlsx.writeBuffer(), spec, {
    recalculation: spec.sheets.some(s => s.formulas?.length) ? 'required-in-spreadsheet-application' : 'no-formulas',
  });
}
function output(bytes, spec, meta = {}) {
  const buffer = Buffer.from(bytes);
  if (buffer.length > 8000000) fail('FILE_LIMIT');
  const after = JSON.stringify(spec, null, 2);
  if (after.length > 200000) fail('TOOL_OUTPUT_LIMIT');
  return { before: '(new file)', after, binary: buffer.toString('base64'), humanConfirmed: false, ...meta };
}
async function createPresentation(spec) {
  const PptxGenJS = require('pptxgenjs');
  if (!spec || !Array.isArray(spec.slides) || !spec.slides.length || spec.slides.length > 20) fail('INVALID_INPUT');
  const deck = new PptxGenJS();
  deck.layout = 'LAYOUT_WIDE';
  deck.author = 'STeP';
  deck.title = spec.title || 'STeP Draft';
  deck.lang = 'th-TH';
  deck.theme = { headFontFace: 'IBM Plex Sans Thai', bodyFontFace: 'IBM Plex Sans Thai', lang: 'th-TH' };
  const text = (v, n) => typeof v === 'string' && v.trim().length > 0 && v.length <= n && !/[\x00-\x1f]/.test(v);
  for (const [i, s] of spec.slides.entries()) {
    if (!s || !text(s.title, 80) || [s.bullets, s.table, s.chart].filter(v => v !== undefined).length > 1) fail('SLIDE_CONTENT_LIMIT');
    if (s.notes !== undefined && (typeof s.notes !== 'string' || s.notes.length > 5000)) fail('SLIDE_CONTENT_LIMIT');
    if (s.source !== undefined && !text(s.source, 2000)) fail('INVALID_INPUT');
    const slide = deck.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addText(s.title, {
      x: 0.65,
      y: 0.45,
      w: 12,
      h: 0.9,
      fontFace: 'IBM Plex Sans Thai',
      fontSize: 30,
      bold: true,
      color: '17365D',
      margin: 0,
      breakLine: false,
    });
    if (s.bullets !== undefined) {
      if (!Array.isArray(s.bullets) || s.bullets.length > 5 || s.bullets.some(v => !text(v, 140))) fail('SLIDE_CONTENT_LIMIT');
      s.bullets.forEach((v, j) =>
        slide.addText(v, {
          x: 0.8,
          y: 1.65 + j * 0.87,
          w: 11.7,
          h: 0.72,
          fontFace: 'IBM Plex Sans Thai',
          fontSize: 22,
          color: '243746',
          margin: 0,
          bullet: { indent: 22 },
          paraSpaceAfterPt: 8,
        }),
      );
    }
    if (s.table) {
      const t = s.table;
      if (
        !Array.isArray(t.headers) ||
        t.headers.length < 1 ||
        t.headers.length > 5 ||
        t.headers.some(v => !text(v, 50)) ||
        !Array.isArray(t.rows) ||
        t.rows.length > 7 ||
        t.rows.some(
          row => !Array.isArray(row) || row.length !== t.headers.length || row.some(v => !scalar(v) || String(v ?? '').length > 60),
        )
      )
        fail('SLIDE_CONTENT_LIMIT');
      slide.addTable(
        [t.headers.map(v => ({ text: v, options: { bold: true, fill: 'E8EEF7' } })), ...t.rows.map(row => row.map(v => String(v ?? '')))],
        {
          x: 0.7,
          y: 1.6,
          w: 11.9,
          h: 4.8,
          fontFace: 'IBM Plex Sans Thai',
          fontSize: 17,
          border: { pt: 0.5, color: 'BBC7D5' },
          margin: 0.12,
          autoPage: false,
        },
      );
    }
    if (s.chart) {
      const c = s.chart;
      if (
        !['bar', 'line', 'pie'].includes(c.type) ||
        !Array.isArray(c.categories) ||
        c.categories.length < 1 ||
        c.categories.length > 8 ||
        c.categories.some(v => !text(v, 35)) ||
        !Array.isArray(c.series) ||
        c.series.length < 1 ||
        c.series.length > 3 ||
        (c.type === 'pie' && c.series.length !== 1) ||
        c.series.some(
          x =>
            !text(x.name, 50) ||
            !Array.isArray(x.values) ||
            x.values.length !== c.categories.length ||
            x.values.some(v => typeof v !== 'number' || !Number.isFinite(v)),
        )
      )
        fail('SLIDE_CONTENT_LIMIT');
      slide.addChart(
        c.type,
        c.series.map(x => ({ name: x.name, labels: c.categories, values: x.values })),
        {
          x: 0.7,
          y: 1.6,
          w: 11.9,
          h: 4.8,
          catAxisLabelFontFace: 'IBM Plex Sans Thai',
          valAxisLabelFontFace: 'IBM Plex Sans Thai',
          showLegend: true,
          showTitle: false,
        },
      );
    }
    slide.addText(`${i + 1} / ${spec.slides.length}`, {
      x: 11.65,
      y: 7,
      w: 1,
      h: 0.2,
      fontFace: 'IBM Plex Sans Thai',
      fontSize: 10,
      color: '65758A',
      margin: 0,
      align: 'right',
    });
    slide.addNotes([s.notes || '', ...(s.source ? [`Source: ${s.source}`] : []), 'Draft: facts require owner review.']);
  }
  return output(await deck.write({ outputType: 'nodebuffer' }), spec, { visualReview: 'required', format: 'editable-pptx' });
}
module.exports = { boundedZip, editWorkbook, createWorkbook, createPresentation, coord };
