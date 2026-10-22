/** One employee request / tool loop. Never persisted or shared with the next message. */
export class GoogleReadConsent {
  private source?: string;
  private decision?: Promise<void>;
  private sourceCheck?: () => Promise<void>;
  private closed = false;
  private results = new WeakMap<object, { text: string; check: () => Promise<void> }>();
  constructor(
    readonly request: string,
    readonly destination: string,
    private check: () => Promise<void>,
  ) {}
  private async current() {
    if (this.closed) throw new Error('CANCELLED');
    await this.check();
    if (this.closed) throw new Error('CANCELLED');
  }
  async authorize(source: string, ask: () => Promise<boolean>, check: () => Promise<void>) {
    await this.current();
    // Reserve before awaiting a dialog: concurrent reads cannot open duplicate prompts or change the account.
    if (this.source !== undefined && this.source !== source) throw new Error('GOOGLE_READ_SCOPE_CHANGED');
    this.source = source;
    this.sourceCheck ??= check;
    this.decision ??= (async () => {
      await check();
      if (!(await ask())) throw new Error('CANCELLED');
      await this.current();
      await check();
    })();
    await this.decision;
    await this.current();
    await check();
    await this.current();
  }
  async record(request: object, text: string, check: () => Promise<void>) {
    await this.current();
    if (!this.decision) throw new Error('GOOGLE_READ_CONSENT_REQUIRED');
    await this.decision;
    await check();
    await this.current();
    this.results.set(request, { text, check });
  }
  /** Local masked account handles and the fixed operation catalog disclose no Google API data. */
  async recordDiscovery(request: object, text: string) {
    await this.current();
    this.results.set(request, { text, check: this.check });
  }
  /** Also checked before later AI turns and cached-result paging, after consent has been granted. */
  async validate() {
    await this.current();
    if (this.decision) {
      await this.decision;
      await this.sourceCheck!();
      await this.current();
    }
  }
  /** Only the exact privacy-reviewed result from the approved native read can reuse transmission consent. */
  async covers(request: object | undefined, text: string) {
    const result = request && this.results.get(request);
    if (!result || result.text !== text) return false;
    await this.current();
    await result.check();
    await this.current();
    return true;
  }
  close() {
    this.closed = true;
    this.results = new WeakMap();
  }
}
