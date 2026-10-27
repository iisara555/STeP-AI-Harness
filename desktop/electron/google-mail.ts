import { googleExact, googleId, googleText } from './google-validation';
import { extractWeb } from './web-extract';

export function googleMailMessage(body: Record<string, any>) {
  googleExact(body, ['to', 'cc', 'bcc', 'subject', 'text', 'threadId', 'inReplyTo']);
  const recipients = (value: any) => {
    if (
      !Array.isArray(value) ||
      !value.length ||
      value.length > 10 ||
      value.some(
        v => typeof v !== 'string' || v.length > 254 || !/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v),
      )
    )
      throw new Error('INVALID_GOOGLE_INPUT');
    return value.join(', ');
  };
  const subject = googleText(body.subject, 200);
  if (/[\r\n]/.test(subject)) throw new Error('INVALID_GOOGLE_INPUT');
  // Keep encoded words within RFC 2047's limit without splitting a Thai UTF-8 character.
  const words: string[] = [];
  let piece = '';
  for (const char of subject) {
    if (Buffer.byteLength(piece + char) > 42) {
      words.push(piece);
      piece = '';
    }
    piece += char;
  }
  words.push(piece);
  const headers = ['To: ' + recipients(body.to)];
  if (body.cc !== undefined) headers.push('Cc: ' + recipients(body.cc));
  if (body.bcc !== undefined) headers.push('Bcc: ' + recipients(body.bcc));
  headers.push('Subject: ' + words.map(word => '=?UTF-8?B?' + Buffer.from(word).toString('base64') + '?=').join('\r\n '));
  if (body.threadId !== undefined || body.inReplyTo !== undefined) {
    googleId(body.threadId);
    const reply = googleText(body.inReplyTo, 500);
    if (!/^<[^\s<>@]+@[^\s<>@]+>$/.test(reply)) throw new Error('INVALID_GOOGLE_INPUT');
    headers.push('In-Reply-To: ' + reply, 'References: ' + reply);
  }
  headers.push('MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64');
  const text = Buffer.from(googleText(body.text))
    .toString('base64')
    .match(/.{1,76}/g)!
    .join('\r\n');
  return {
    raw: Buffer.from(headers.join('\r\n') + '\r\n\r\n' + text).toString('base64url'),
    ...(body.threadId ? { threadId: body.threadId } : {}),
  };
}

/** Decode content before the existing privacy scan; raw MIME and attachment base64 never reach the model. */
export function googleMailContent(message: any) {
  const parts: string[] = [],
    htmlParts: string[] = [],
    attachments: object[] = [];
  let visited = 0,
    undecodable = false,
    truncated = false;
  const extract = (part: any, depth = 0) => {
    if (!part) return;
    if (depth > 10 || visited >= 50) {
      truncated = true;
      return;
    }
    visited++;
    if (['text/plain', 'text/html'].includes(part.mimeType) && typeof part.body?.data === 'string' && !part.filename) {
      try {
        const encoded = part.body.data;
        if (!/^[A-Za-z0-9_-]*={0,2}$/.test(encoded)) throw new Error();
        const bytes = Buffer.from(encoded, 'base64url');
        if (bytes.toString('base64url') !== encoded.replace(/=+$/, '')) throw new Error();
        const contentType = Array.isArray(part.headers)
          ? part.headers.find((h: any) => String(h?.name).toLowerCase() === 'content-type')?.value
          : undefined;
        const charset =
          typeof contentType === 'string' ? /(?:^|;)\s*charset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;\s]+))/i.exec(contentType) : null;
        const encoding = charset ? (charset[1] ?? charset[2] ?? charset[3]) : 'utf-8';
        if (!encoding || encoding.length > 100) throw new Error();
        const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
        if (text.includes('\0')) throw new Error();
        (part.mimeType === 'text/html' ? htmlParts : parts).push(text);
      } catch {
        undecodable = true;
      }
    }
    if (typeof part.body?.attachmentId === 'string' || (typeof part.filename === 'string' && part.filename.trim()))
      attachments.push({
        attachmentId: part.body.attachmentId,
        filename: String(part.filename || '').slice(0, 300),
        mimeType: part.mimeType,
        size: part.body.size,
      });
    if (Array.isArray(part.parts)) for (const child of part.parts) extract(child, depth + 1);
  };
  extract(message.payload);
  let htmlFallback = false,
    inlineImagesNotRead = htmlParts.some(html => /<(?:img|svg|object)\b/i.test(html));
  if (!parts.some(part => part.trim()) && htmlParts.length) {
    try {
      const html = htmlParts.join('\n');
      const extracted = extractWeb(html, 'https://mail.google.com/', { preserveDocumentContent: true });
      parts.length = 0;
      if (extracted.text) parts.push(extracted.text);
      if (extracted.truncated) truncated = true;
      htmlFallback = true;
    } catch {
      undecodable = true;
    }
  }
  const text = parts.join('\n');
  if (text.length > 80000) truncated = true;
  return {
    id: message.id,
    threadId: message.threadId,
    labelIds: message.labelIds,
    text: text.slice(0, 80000),
    ...(truncated ? { contentTruncated: true } : {}),
    ...(htmlFallback ? { contentFormat: 'html-text' } : {}),
    ...(inlineImagesNotRead ? { inlineImagesNotRead: true } : {}),
    headers: Array.isArray(message.payload?.headers)
      ? message.payload.headers
          .filter((h: any) =>
            ['from', 'to', 'cc', 'bcc', 'subject', 'date', 'message-id', 'references'].includes(String(h.name).toLowerCase()),
          )
          .map((h: any) => ({ name: String(h.name), value: String(h.value).slice(0, 2000) }))
      : [],
    ...(attachments.length ? { attachments } : {}),
    ...(undecodable
      ? { contentUnavailable: 'Some message content could not be decoded; open Gmail to inspect the complete message.' }
      : text.trim()
        ? {}
        : { contentUnavailable: 'No readable text body available; open Gmail to inspect the message and attachments.' }),
  };
}
