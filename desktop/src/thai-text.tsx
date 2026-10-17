import { Fragment } from 'react';
import { thaiPhrases } from './thai-typography';

/** Staff-facing Thai copy that must not break inside a word; see thaiPhrases in thai-typography.ts. */
export function ThaiText({ text }: { text: string }) {
  return (
    <>
      {thaiPhrases(text).map((part, i) =>
        part.keep ? (
          <span key={i} className="thai-keep">
            {part.text}
          </span>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
