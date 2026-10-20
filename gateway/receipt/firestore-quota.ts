import type { ReceiptQuota } from './service';
/** Firestore's atomic commit preconditions serialize reservations across Cloud Run instances and restarts. */
export class FirestoreReceiptQuota implements ReceiptQuota {
  private token?: { access_token: string; expires: number };
  constructor(
    private project: string,
    private transport = fetch,
  ) {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project)) throw new Error('OCR_CONFIGURATION');
  }
  private async access() {
    if (!this.token || this.token.expires < Date.now() + 60_000) {
      const res = await this.transport('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
        headers: { 'Metadata-Flavor': 'Google' },
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error('OCR_SERVICE_UNAVAILABLE');
      const value = await res.json();
      if (typeof value.access_token !== 'string' || !Number.isFinite(value.expires_in) || value.expires_in <= 0)
        throw new Error('OCR_SERVICE_UNAVAILABLE');
      this.token = {
        access_token: value.access_token,
        expires: Date.now() + value.expires_in * 1000,
      };
    }
    return this.token.access_token;
  }
  async reserve(subject: string, requestId: string, daily: number, perUser: number) {
    const day = new Date().toISOString().slice(0, 10);
    const root = `projects/${this.project}/databases/(default)/documents`;
    const names = [`${root}/receiptOcrQuota/${day}`, `${root}/receiptOcrQuota/${day}/receiptOcrPeople/${subject}`];
    const endpoint = 'https://firestore.googleapis.com/v1/';
    for (let attempt = 0; attempt < 5; attempt++) {
      const headers = {
        authorization: 'Bearer ' + (await this.access()),
        'content-type': 'application/json',
      };
      const get = async (name: string) => {
        const res = await this.transport(endpoint + name, {
          headers,
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
        });
        if (res.status === 404) {
          await res.body?.cancel().catch(() => {});
          return undefined;
        }
        if (!res.ok) {
          await res.body?.cancel().catch(() => {});
          throw new Error('OCR_SERVICE_UNAVAILABLE');
        }
        const text = await res.text();
        if (text.length > 10_000) throw new Error('OCR_SERVICE_UNAVAILABLE');
        return JSON.parse(text);
      };
      if (await get(`${root}/receiptOcrRequests/${requestId}`)) throw new Error('OCR_REQUEST_REPLAYED');
      const docs = await Promise.all(names.map(get));
      const counts = docs.map(doc => (doc ? Number(doc.fields?.count?.integerValue) : 0));
      if (counts.some(n => !Number.isSafeInteger(n) || n < 0) || docs.some(doc => doc && typeof doc.updateTime !== 'string'))
        throw new Error('OCR_SERVICE_UNAVAILABLE');
      if (counts[0] >= daily || counts[1] >= perUser) throw new Error('OCR_DAILY_LIMIT');
      const expiresAt = {
        timestampValue: new Date(Date.now() + 7 * 86400_000).toISOString(),
      };
      const writes = names.map((name, i) => ({
        update: {
          name,
          fields: { count: { integerValue: String(counts[i] + 1) }, expiresAt },
        },
        currentDocument: docs[i] ? { updateTime: docs[i].updateTime } : { exists: false },
      }));
      const response = await this.transport(endpoint + root + ':commit', {
        method: 'POST',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          writes: [
            ...writes,
            {
              update: {
                name: `${root}/receiptOcrRequests/${requestId}`,
                fields: { expiresAt },
              },
              currentDocument: { exists: false },
            },
          ],
        }),
      });
      let stale = [409, 412].includes(response.status);
      if (response.status === 400) {
        const raw = await response.text();
        try {
          stale = raw.length <= 8192 && JSON.parse(raw).error?.status === 'FAILED_PRECONDITION';
        } catch {
          /* Do not expose upstream diagnostics. */
        }
      }
      await response.body?.cancel().catch(() => {});
      if (response.ok) return;
      if (!stale) throw new Error('OCR_SERVICE_UNAVAILABLE');
    }
    throw new Error('PROVIDER_BUSY');
  }
}
