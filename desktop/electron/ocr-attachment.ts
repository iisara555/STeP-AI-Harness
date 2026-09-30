export function ocrAttachmentReport(result: any, privacy: (text: string) => any) {
  if (
    !Array.isArray(result?.pages) ||
    !result.pages.length ||
    result.pages.length > 100 ||
    typeof result.text !== 'string' ||
    !result.text.trim()
  )
    return { extractionStatus: 'unavailable', reviewReasons: ['no-extractable-text'] };
  if (
    result.pages.some(
      (p: any) => !String(p.text || (Array.isArray(p.lines) ? p.lines.map((l: any) => l.text || '').join('\n') : '')).trim(),
    )
  )
    return { extractionStatus: 'partial', reviewReasons: ['pages-without-text'] };
  const report = { ...privacy(result.text), extractionStatus: 'text-extracted', reviewReasons: [], ocr: true };
  return report;
}
