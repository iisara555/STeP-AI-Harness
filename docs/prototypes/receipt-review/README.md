# Receipt review design prototype

Open `index.html` directly in a current Chrome/Edge/Chromium browser. No server, build, credentials or network access is needed. This is a design artifact for [the proposed system](../../receipt-review-redesign.md); it is not the Desktop app or an OCR implementation.

If a managed browser blocks local `file:` pages, serve this directory with `python3 -m http.server 8769 --bind 127.0.0.1` and open `http://127.0.0.1:8769/`. This uses only loopback and does not change browser policies.

All documents, readings, rule outcomes and amounts are synthetic fixtures. The scenario selector changes the fixture. Changing the classified type invalidates the result and preserves the source document. The document selector demonstrates separate results for two receipts; it does not detect or split an uploaded image. The grouping control shows manually assigned example regions, not inferred layout.

Try all seven scenarios, all four type choices, source highlighting, zoom, grouping, the two-document selector, light/dark, keyboard navigation, dialog Escape and narrow windows. Dialogs prepare text only; they never submit or send anything. Copy requires the browser's clipboard permission; a refusal leaves selectable text.

No file picker or OCR upload is implemented. `connect-src 'none'` blocks outgoing requests. No state is saved. The bundled IBM Plex Sans Thai 400 Thai/Latin subsets come from the app's existing `@fontsource/ibm-plex-sans-thai` dependency under [SIL OFL 1.1](fonts/OFL.txt). Other weights use browser synthesis in this prototype. No external assets or model weights are included.

Changes to production remain separate work: adapter/pipeline, versioned source-backed rules, privacy/consent, real-document benchmark and Electron integration.
