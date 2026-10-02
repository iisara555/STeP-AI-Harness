/** What the send-time privacy review found, and what the request carries. */
export type SendSignals = {
  action: 'pass' | 'human-confirm' | 'block-external';
  keywordOnly: boolean;
  first: boolean;
  attachment: boolean;
  source: boolean;
  vision: boolean;
  coordinated: boolean;
};

/**
 * Decides whether a send needs the in-app consent dialog. Blocking is not a question: credentials and sensitive data
 * tied to a person stop the send in every mode. Pilot mode (managed policy) asks only where a person must look:
 * the first send without the setup acknowledgment, data that may identify someone, images the text scan cannot
 * read, and runs that hand work to several AI workers. A sensitive word alone becomes a warning.
 */
export function sendConsent(signals: SendSignals, pilot: boolean): { block: boolean; ask: boolean; warning: boolean } {
  if (signals.action === 'block-external') return { block: true, ask: false, warning: false };
  const flagged = signals.action === 'human-confirm';
  if (!pilot)
    return {
      block: false,
      ask: signals.first || signals.attachment || signals.source || flagged || signals.coordinated,
      warning: false,
    };
  const warning = flagged && signals.keywordOnly;
  return { block: false, ask: signals.first || (flagged && !warning) || signals.vision || signals.coordinated, warning };
}
