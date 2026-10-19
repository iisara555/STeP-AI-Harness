import { googleExact, googleId, googleText } from './google-validation';

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
    attachments: object[] = [];
  let visited = 0;
  const extract = (part: any, depth = 0) => {
    if (!part || depth > 10 || ++visited > 50) return;
    if (part.mimeType === 'text/plain' && typeof part.body?.data === 'string')
      parts.push(Buffer.from(part.body.data, 'base64url').toString('utf8'));
    if (typeof part.body?.attachmentId === 'string')
      attachments.push({
        attachmentId: part.body.attachmentId,
        filename: String(part.filename || '').slice(0, 300),
        mimeType: part.mimeType,
        size: part.body.size,
      });
    if (Array.isArray(part.parts)) for (const child of part.parts) extract(child, depth + 1);
  };
  extract(message.payload);
  return {
    id: message.id,
    threadId: message.threadId,
    labelIds: message.labelIds,
    text: parts.join('\n').slice(0, 80000),
    headers: Array.isArray(message.payload?.headers)
      ? message.payload.headers
          .filter((h: any) =>
            ['from', 'to', 'cc', 'bcc', 'subject', 'date', 'message-id', 'references'].includes(String(h.name).toLowerCase()),
          )
          .map((h: any) => ({ name: String(h.name), value: String(h.value).slice(0, 2000) }))
      : [],
    ...(attachments.length ? { attachments } : {}),
    ...(parts.length ? {} : { contentUnavailable: 'No plain-text body available; open Gmail to inspect HTML/attachments.' }),
  };
}
