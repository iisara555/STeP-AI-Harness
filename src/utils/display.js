import { colors } from './colors.js';

export function header(title) {
  console.log();
  console.log(`${colors.cyan(colors.bold('STeP AI Harness'))} — ${colors.bold(title)}`);
  console.log(colors.dim('─'.repeat(60)));
}

export function success(msg) {
  console.log(`${colors.green('✔')} ${msg}`);
}

export function info(msg) {
  console.log(`${colors.cyan('ℹ')} ${msg}`);
}

export function warn(msg) {
  console.log(`${colors.yellow('⚠')} ${msg}`);
}

export function error(msg) {
  console.error(`${colors.red('✖')} ${msg}`);
}

/**
 * Print a simple aligned table
 * @param {string[]} headers 
 * @param {string[][]} rows 
 */
export function table(headers, rows) {
  const colWidths = headers.map((h, i) => {
    let max = h.length;
    for (const row of rows) {
      const cell = String(row[i] || '');
      if (cell.length > max) max = cell.length;
    }
    return max + 2;
  });

  const formatRow = (row, colorFn = (s) => s) =>
    row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join(' ');

  console.log(colors.bold(formatRow(headers)));
  console.log(colors.dim(colWidths.map((w) => '─'.repeat(w - 1)).join(' ')));
  for (const row of rows) {
    console.log(formatRow(row));
  }
}
