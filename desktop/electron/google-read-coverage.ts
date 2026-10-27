import type { GoogleRequest } from './google-operations';

/** Describes the returned scope, never a claim that a whole account or linked resource was inspected. */
export function googleReadCoverage(request: GoogleRequest, data: any) {
  const reasons = new Set<string>();
  if (typeof data?.nextPageToken === 'string' && data.nextPageToken) reasons.add('NEXT_PAGE_AVAILABLE');
  if (data?.incompleteSearch === true) reasons.add('SEARCH_INCOMPLETE');
  if (data?.messagesTruncated === true) reasons.add('MESSAGES_TRUNCATED');
  const messages =
    request.operation === 'gmail.get'
      ? [data]
      : request.operation === 'gmail.drafts.get'
        ? [data?.message]
        : request.operation === 'gmail.threads.get' && Array.isArray(data?.messages)
          ? data.messages
          : [];
  for (const message of messages) {
    if (message?.contentTruncated) reasons.add('CONTENT_TRUNCATED');
    if (message?.contentUnavailable) reasons.add('CONTENT_UNAVAILABLE');
    if (message?.attachments?.length) reasons.add('ATTACHMENTS_NOT_READ');
    if (message?.inlineImagesNotRead) reasons.add('EMBEDDED_CONTENT_NOT_READ');
  }
  let tabsRead: number | undefined;
  if (request.operation === 'docs.get') {
    tabsRead = 0;
    const pending = Array.isArray(data?.tabs) ? [...data.tabs] : [];
    if (!pending.length) reasons.add('DOCUMENT_TABS_UNAVAILABLE');
    const embedded = (part: any) => Object.keys(part?.inlineObjects || {}).length + Object.keys(part?.positionedObjects || {}).length;
    if (embedded(data)) reasons.add('EMBEDDED_CONTENT_NOT_READ');
    while (pending.length && tabsRead < 1000) {
      const tab = pending.pop();
      tabsRead++;
      if (!tab?.documentTab) reasons.add('TAB_CONTENT_UNAVAILABLE');
      if (embedded(tab?.documentTab)) reasons.add('EMBEDDED_CONTENT_NOT_READ');
      if (Array.isArray(tab?.childTabs)) {
        for (const child of tab.childTabs) {
          if (pending.length + tabsRead >= 1000) {
            reasons.add('TAB_INSPECTION_LIMIT');
            break;
          }
          pending.push(child);
        }
      }
    }
    if (pending.length) reasons.add('TAB_INSPECTION_LIMIT');
  }
  const count = ['items', 'files', 'messages', 'threads', 'responses', 'values'].find(key => Array.isArray(data?.[key]));
  return {
    scope:
      request.operation === 'docs.get'
        ? 'returned document tabs and text; images, drawings, comments and linked resources are not read'
        : request.operation.startsWith('gmail.')
          ? 'returned message text or search page; attachments require a separate read'
          : 'requested resource, range or result page only',
    complete: reasons.size === 0,
    reasons: [...reasons],
    ...(count ? { returnedItems: data[count].length } : {}),
    ...(tabsRead !== undefined ? { tabsRead } : {}),
    ...(request.operation === 'calendar.events' ? { timeMin: request.params!.timeMin, timeMax: request.params!.timeMax } : {}),
    guidance:
      'Follow nextPageToken when needed. Disclose unread or truncated content. An incomplete read cannot establish that no matching record exists.',
  };
}
