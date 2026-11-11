// Which workspace files the Files tab can show inside the app, and which it may hand to the computer's own app.
// Shared by the renderer (buttons) and the main process (the checks that count).
export const OFFICE_PREVIEW = new Set(['.docx', '.docm', '.xlsx', '.xlsm', '.pptx', '.pptm']);
export const IMAGE_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};
/** Documents, pictures and media only: never programs, scripts, shortcuts or installers. */
export const OPEN_EXTERNALLY = new Set([
  ...OFFICE_PREVIEW,
  ...Object.keys(IMAGE_TYPES),
  '.doc',
  '.xls',
  '.ppt',
  '.pdf',
  '.csv',
  '.txt',
  '.md',
  '.rtf',
  '.odt',
  '.ods',
  '.odp',
  '.mp3',
  '.mp4',
  '.m4a',
  '.wav',
  '.mov',
]);
export const fileExtension = (path: string) => (/\.[^./\\]+$/.exec(path)?.[0] || '').toLowerCase();
export const previewable = (extension: string) => OFFICE_PREVIEW.has(extension) || extension in IMAGE_TYPES;
