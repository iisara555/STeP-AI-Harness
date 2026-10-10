const LIMIT = 8000;
const WITHHELD = '[output withheld by the privacy check]\n';
// The supported credential keys match the privacy scanner. A key with no value must stay with the next nonempty line.
const EMPTY_KEY =
  /\b(?:password|passwd|pwd|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|cookie|authorization|mfa[_-]?code|recovery[_-]?code)["']?\s*[:=]\s*["']?\s*$|\bBearer\s*$/i;

/** Bounded, append-only output: never release part of an unfinished line or an orphaned credential value. */
export class StreamOutput {
  private line = '';
  private key = '';
  private oversized = false;
  private withheldValue = false;
  private cr = false;
  constructor(
    private scrub: (text: string) => string | null | undefined,
    private emit: (text: string) => void,
  ) {}
  write(text: string) {
    for (const part of text.split(/(\r\n|\r|\n)/)) {
      if (!part) continue;
      if (/^[\r\n]+$/.test(part)) {
        if (this.cr && part === '\n') {
          this.cr = false;
          continue;
        }
        this.complete('\n');
        this.cr = part === '\r';
      } else {
        this.cr = false;
        if (!this.oversized) {
          if (this.line.length + part.length > LIMIT) {
            this.oversized = true;
            this.line = '';
          } else this.line += part;
        }
      }
    }
  }
  end() {
    if (this.line || this.oversized) this.complete('');
    if (this.key) {
      // A key without a value is withheld too: the next run must not inherit a partial credential.
      this.emit(WITHHELD);
      this.key = '';
    }
  }
  private complete(ending: string) {
    const raw = this.line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    this.line = '';
    if (this.oversized) {
      this.oversized = false;
      this.key = '';
      this.withheldValue = true;
      this.emit(WITHHELD);
      return;
    }
    if (this.withheldValue) {
      if (raw.trim()) {
        this.emit(WITHHELD);
        this.withheldValue = false;
      }
      return;
    }
    if (this.key) {
      if (!raw.trim()) return;
      const combined = this.key + raw + ending;
      this.key = '';
      this.publish(combined);
    } else if (EMPTY_KEY.test(raw)) {
      this.key = raw + '\n';
    } else if (raw || ending) this.publish(raw + ending);
  }
  private publish(raw: string) {
    let safe: string | null | undefined;
    try {
      safe = this.scrub(raw);
    } catch {
      safe = undefined;
    }
    if (typeof safe === 'string') this.emit(safe);
    else {
      this.emit(WITHHELD);
      // A rejected line may end in a credential key. Fail closed on its next nonempty continuation.
      this.withheldValue = true;
    }
  }
}
