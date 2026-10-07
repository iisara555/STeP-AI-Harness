# Synthetic receipt benchmark and private pilot

This is development tooling, not an OCR/Router integration or an accuracy certificate.
See [synthetic quality evidence, 2026-10-06](QUALITY-RESULTS-2026-10-06.md) for the
measured before/after comparisons and remaining errors of the 0.5.21 revision.
That report is historical evidence, not a score for subsequent OCR changes. See the
[current component guide](../README.md) for this checkout and the
[main component guide](https://github.com/iisara555/STeP-AI-Harness/blob/main/experiments/local-thai-ocr/README.md)
for the latest merged source. Compare exact revisions on identical inputs again
when detection size, PDF DPI, rotation or mapping changes. Record extra model reads
and employee-machine time/RAM rather than assuming higher resolution is faster.
The acceptance gate stays **OPEN** until the repository owner reviews authorized
real-document pilot evidence. Windows with 2 CPU cores and macOS M1 with 4 GB RAM
are the target machines; Linux cloud timings do not establish readiness on either.
Record the Windows RAM, OS versions, CPU model and available RAM with each pilot.

## Install and generate

Use the existing OCR environment for live OCR. `requirements-core.txt` does not
install PaddlePaddle itself; use the platform-supported build documented by the
existing installers. Install `psutil` in the benchmark development environment only.
Generation needs Pillow with RAQM and a licensed Thai TTF/OTF font. Noto Serif Thai
is available under the SIL OFL; supply its installed path. No fonts, model weights,
or generated image collection are committed or added to employee installers.

From `experiments/local-thai-ocr`:

```sh
python -m benchmark.generate --font /path/to/NotoSerifThai-Regular.ttf \
  --fallback-font /path/to/DejaVuSans.ttf --output /path/outside/repo/synthetic-80
python -m benchmark.run --input /path/outside/repo/synthetic-80 \
  --output /path/outside/repo/paddle-run --mode ocr --limit 80 \
  --runtime-path /path/to/ocr-venv --model-cache /path/to/model-cache
```

Some packaged Thai fonts contain no Arabic digits or Latin letters. The generator
checks glyph coverage before rendering and rejects missing glyphs rather than
producing boxes with a numeric answer file. Supply a licensed `--fallback-font`
for those glyphs; both font digests enter the truth. Thai runs remain RAQM-shaped.
`--include-phone-rotation` adds one JPEG with sideways pixels and EXIF orientation
to check phone-image handling. This is metadata rotation, not automatic deskew.

The seeded default creates 80 image/answer pairs: ten per H–O. `.truth.json`
contains canonical and raw fields, synthetic provenance, scenario, distortions,
font digest and evidence regions. H/full or abbreviated tax invoices includes
Thai digits and Buddhist years. I omits a field; J simulates faded/creased/cropped
thermal paper; K is 22.4 MP; L puts a labeled buyer number in the issuer area;
M splits labels and values; N adds skew; O shears printed text to simulate
handwriting. **O is not real handwriting**; passing it cannot establish Thai-TrOCR
benefit. The original fixture lines are for mapping regressions, not OCR accuracy;
rotated/sheared cases have document-only evidence regions.

Repeat OCR variants with `--crosscheck`, `--tesseract`, `--handwriting` in separate
new output directories. Missing optional engines must be recorded as unavailable:
inspect OCR warnings and actual checked/candidate counts, not only requested flags.
The runner preserves those outputs in each `.reading.json` and `.ocr.json`.
Use `--threshold` for a threshold sweep; hold the image set constant.

## Independent vision and combined readings

The development helper uses Desktop's `CodexAdapter`, vision system prompt/parser
and shared mapping code; runtime file/shell tools stay disabled by the adapter.
It uses the existing authenticated runtime, never copies a credential. Live calls
are bounded, require an explicit flag, and can consume quota:

```sh
python -m benchmark.run --input /path/outside/repo/synthetic-80 \
  --output /path/outside/repo/vision-run --mode vision --live-vision \
  --max-live 2 --limit 2 --codex /path/to/authenticated/codex --model MODEL
python -m benchmark.run --input /path/outside/repo/synthetic-80 \
  --output /path/outside/repo/combined-run --mode combined --live-vision \
  --max-live 2 --limit 2 --codex /path/to/authenticated/codex --model MODEL
```

Live vision currently accepts PNG. Deliberately render PDF pages before benchmarking
vision; do not silently treat the first page as the whole PDF. Set the model name
for reproducibility; an omitted model is labeled `provider-default`. This helper is
not a new production consent route. This helper uses Codex; Desktop has other
image-capable transports with different wire formats and entitlement. Reports must
identify the actual provider/model and cannot stand for all Desktop providers. Private/live use requires document-owner permission
and separate approval for external image transmission; `--private` alone never sends.
The benchmark does not change Desktop privacy defaults or skip its production gates.

For offline scoring, `--replay /path/to/readings` reads `<case>.reading.json`
containing `ocr` and `visionReply`. Replay reports are explicitly labeled
`replay-not-model-accuracy`. Missing vision, zero cases, timeouts and failed workers
fail the command instead of becoming passing/empty results. Comparison agreement
can still be wrong against ground truth. Vision's empty values are review signals,
not calibrated model confidence. Combined fills empty/guessed fields and preserves
mapped OCR fields just as Desktop currently does; it does not simulate human edits.

## Metrics and evidence

`report.json` has per-document and per-field raw/canonical exact match, wrong,
missing and invented values, critical number/money/date/reference errors and review
TP/FP/FN/TN. Raw exact uses printed digits; canonical converts Thai digits, money
format and explicit full-year dates. Malformed comma/decimal groups are errors,
not silently repaired amounts. It preserves reference leading zeroes and
merchant distinctions rather than using the UI's loose agreement heuristic.
Review flags are attributed using the mapping's source evidence; ambiguous/empty
fields also flag, and combined disagreement adds a flag. Errors that both engines
agree on remain FN. No accuracy target is imposed before owner baseline review.

Each operation reports wall time, exit status, timeout and 20-ms-sampled peak
process-tree RSS. Sampling can miss short peaks; summing RSS can double-count shared
pages. OCR creates a fresh worker per document: `cached-downloads` is not warm-process
inference. Record `--cache-state`; model downloads and initializations are not
subtracted. Disk measurements are optional; unset measurements stay null, never zero.
Before/after cache-size measurements plus first-download runs distinguish installation
cost from inference. Reports include installed package versions and requested options.

## Private pilot

Put authorized images, paired answers, replay responses and all results outside the
checkout. Use `--private` for every real-document run. The runner resolves paths and
rejects checkout paths, including ignored paths and symlinks into the checkout.
Names in console/report are ordinal `doc-NNNN`, not receipt filenames. Raw readings
remain in the external output folder and must follow organization retention rules.
`.gitignore` is a secondary guard, not permission to store private data in Git.

```sh
python -m benchmark.run --private --input /private/pilot-input \
  --output /private/pilot-results/run-001 --mode ocr
```

Every input uses an image plus `<stem>.truth.json`, with all seven `fields` (use
empty strings for absent values); answers must be transcribed/reviewed by a person.
Keep output separate from input. Never overwrite a run. Record authorized human
corrections, review completion/time and helpful/unchanged/worse handwriting outcomes
in the external pilot record. Fill TEST-PLAN H–O from that evidence. Do not commit
real images, names, identifiers, ground truth, OCR text, model replies or reports.

Developer checks: `npm test` includes lightweight benchmark tests (image generation
skips when Pillow/Thai font is unavailable). `npm run desktop:test` discovers the
mapping/vision benchmark tests. Full OCR/vision execution is separate and explicit.
