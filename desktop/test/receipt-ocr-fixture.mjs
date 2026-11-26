/** Route only the synthetic Electron process's OCR requests away from an employee's running OCR service. */
export async function routeFixtureOcr(app, server) {
  await app.evaluate((_, port) => {
    const originalFetch = globalThis.fetch;
    const ocrUrl = 'http://127.0.0.1:8765/';
    globalThis.fetch = (input, options) =>
      originalFetch(
        typeof input === 'string' && input.startsWith(ocrUrl) ? input.replace(ocrUrl, `http://127.0.0.1:${port}/`) : input,
        options,
      );
  }, server.address().port);
}
