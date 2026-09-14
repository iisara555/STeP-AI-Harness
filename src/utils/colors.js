// Pure Node.js zero-dependency terminal colors and formatting
const isColorSupported = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);

function code(open, close) {
  return (str) => (isColorSupported ? `\x1b[${open}m${str}\x1b[${close}m` : String(str));
}

export const colors = {
  reset: code(0, 0),
  bold: code(1, 22),
  dim: code(2, 22),
  italic: code(3, 23),
  underline: code(4, 24),
  red: code(31, 39),
  green: code(32, 39),
  yellow: code(33, 39),
  blue: code(34, 39),
  magenta: code(35, 39),
  cyan: code(36, 39),
  gray: code(90, 39),
  bgBlue: code(44, 49),
  bgGreen: code(42, 49),
  bgYellow: code(43, 49),
  bgRed: code(41, 49),
};
