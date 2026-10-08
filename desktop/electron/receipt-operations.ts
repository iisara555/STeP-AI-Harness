/** Claim the receipt workflow before dialogs or rendering await; only its owner may release it. */
export class ReceiptOperations {
  private current?: AbortController;

  async run<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.current) throw new Error('RUN_LIMIT');
    const controller = new AbortController();
    this.current = controller;
    try {
      const result = await task(controller.signal);
      if (controller.signal.aborted) throw new Error('CANCELLED');
      return result;
    } finally {
      if (this.current === controller) this.current = undefined;
    }
  }

  cancel() {
    this.current?.abort();
  }
}
