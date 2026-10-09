// Packaged builds open a loading window first (electron/splash.ts); smoke tests drive the workspace window.
export async function mainWindow(app, timeout = 45000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const page = app.windows().find(w => w.url().includes('renderer/index.html'));
    if (page) return page;
    if (Date.now() > deadline) throw new Error('The main STeP Desktop window did not open');
    await new Promise(done => setTimeout(done, 200));
  }
}
