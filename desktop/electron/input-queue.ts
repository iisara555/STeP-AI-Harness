/** One host-driven SDK conversation. Input ends when the run closes; nothing is stored on disk. */
export class InputQueue<T> implements AsyncIterable<T> {
  private values: T[] = [];
  private waiting?: (value: IteratorResult<T>) => void;
  private ended = false;
  push(value: T) {
    if (this.ended) throw new Error('PROVIDER_SESSION_INVALID');
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = undefined;
      resolve({ done: false, value });
    } else this.values.push(value);
  }
  close() {
    this.ended = true;
    this.values = [];
    this.waiting?.({ done: true, value: undefined });
    this.waiting = undefined;
  }
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.values.length) return Promise.resolve({ done: false, value: this.values.shift()! });
        if (this.ended) return Promise.resolve({ done: true, value: undefined });
        return new Promise(resolve => {
          this.waiting = resolve;
        });
      },
    };
  }
}
