# Local Thai OCR: exploratory quality evidence, 2026-10-20

Actual PaddleOCR CPU inference on seven fixed synthetic cases reduced Unicode
code-point CER from **331/1554 (21.30%) to 37/1554 (2.38%)**. Replaying both
sets of raw OCR through the same final mapper gives **34/49 → 42/49** canonical
field matches, with no field regressions on these inputs. This is a narrow
development comparison, **not a general Thai accuracy score**. All seven
merchant names still have Thai-mark errors. Employee-document acceptance stays OPEN.

## What changed and why

- Scanned PDFs now render at 300 DPI within a 4800 px longest-side bound and use
  the existing overlapping detail tiles, like images. Previously they rendered
  at 200 DPI, capped at 2400 px and bypassed detail tiles.
- Sideways, empty or weak readings can retry 180°, 90° and 270°. Upright clear
  pages keep the single reading. No new orientation model/download is required.
- Small-skew retries need at least three long text baselines, at least 75%
  agreeing within 1°, and a median angle of 0.6–8°. The retry is retained only
  when the same-model reading score improves by more than 5% without a large
  drop in character-weighted confidence. Confidence is a ranking heuristic,
  not accuracy; high-confidence wrong readings remain possible.
- Faded pages retain the unmodified first reading and compare bounded
  autocontrast. Optional readers run only on the selected page, conserving
  their per-document budgets. No aggressive thresholding or spelling correction.
- A follow-up addresses two observed VAT mapping regressions: fixed Thai labels
  with missing ี/่ can use an actual same-line/same-row amount, retain the raw
  evidence and require review. The fallback excludes percentages, before-tax/
  inclusive-tax labels, distant numbers and exact-label overrides. It does not
  repair merchant names, financial digits or absent amounts.
- The benchmark now optionally scores complete `expected_lines` using NFC and
  whitespace removal while retaining Thai marks and numeric punctuation.

## Public implementations studied

| Implementation | Evidence and useful mechanism | Application here |
| --- | --- | --- |
| PaddleOCR Thai PP-OCRv5 | [Thai model card](https://huggingface.co/PaddlePaddle/th_PP-OCRv5_mobile_rec/blob/main/README.md), [OCR pipeline](https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/OCR.html): separate detection/recognition and optional orientation stages | Retain the Thai recognizer and cached mobile detector; repair input resolution/orientation before adding heavier models |
| EasyOCR | [Recognition source](https://github.com/JaidedAI/EasyOCR/blob/master/easyocr/recognition.py) retries low-confidence crops with contrast adjustment; [API guide](https://www.jaided.ai/easyocr/documentation/) documents Thai margin needs | Compare preprocessing against the source reading; retain existing crop padding and tone-sensitive comparisons |
| Tesseract / Tesseract.js | [Quality guide](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html) discusses resolution, skew and borders; [v7 worker](https://github.com/naptha/tesseract.js/blob/v7.0.0/src/worker-script/index.js) uses line-gradient estimation before an optional image rotation | Trial bounded deskew from agreeing text polygons; test higher PDF resolution rather than assume it improves Thai |

These mechanisms inform hypotheses. Upstream benchmarks do not establish our
accuracy, and this study does not infer private Google/other cloud internals.
The local-only host policy and refusal of external fallback remain unchanged.

## REA provenance and coverage

Analyzed the published `tesseract.js@7.0.0` npm artifact as inert JavaScript,
downloaded from the [official registry](https://registry.npmjs.org/tesseract.js/7.0.0)
with `npm pack --ignore-scripts`. Tarball SHA-256:
`9a93bf51c3387f945d10a24bf8b3a4bf2e45c7c7161b8242aafbaf9d3c4b606a`.
REA directory digest:
`1f58dfc5df478d9ac02138573674f220ca17dfad1cb1e45e9cfd757dcd407b46`.

`analyze_javascript_application` selected five shipped paths:
`src/worker-script/index.js`, `src/worker-script/utils/setImage.js`,
`src/createWorker.js`, `src/worker-script/node/getCore.js`, `src/constants/PSM.js`.
Retained parent evidence:
`ev_caf53813df525dae9e3ddb705aa77e549c645fadcf55a70cb4a353242a7dacd0`.
Summary, module-reference pages and the selected worker module were inspected.
Five JavaScript files parsed, zero parse failures; 58 inventoried files remain
outside selection and semantic coverage is partial (1396 unknown records).
The literal `rotateAuto` feature trace returned no graph match; this does **not**
prove absence. Its implementation was read directly in the shipped worker.
No package bootstrap, WASM/native recognizer, model weights or runtime behavior
was executed by REA. PaddleOCR/EasyOCR open source was studied through ordinary
source/docs, as the REA Skill directs. The raw REA evidence export and downloaded
artifact are retained outside Git in the task's `output/CC/2026/10/ocr-research/`.

## Fixed-input results

| Synthetic case | Correct fields, old → final (same final mapper) | CER, old → new raw OCR |
| --- | ---: | ---: |
| Faded/blurred | 6/7 → 6/7 | 0.90% → 0.90% |
| 180° | 1/7 → 6/7 | 96.85% → 1.35% |
| 270° | 6/7 → 6/7 | 1.35% → 1.35% |
| 90° | 6/7 → 6/7 | 1.35% → 1.35% |
| Skew 3° | 6/7 → 6/7 | 31.53% → 3.60% |
| Small-font raster PDF | 3/7 → 6/7 | 15.77% → 6.76% |
| Upright | 6/7 → 6/7 | 1.35% → 1.35% |
| Total | 34/49 → 42/49 | 21.30% → 2.38% |

CER counts Unicode code points, not graphemes or words, and penalizes reading
order. Part of the skew improvement is ordering. Each case has 222 reference
code points, including 38 Thai combining marks. No cases were dropped.
Each of reference/date/tax ID/subtotal/VAT/total matches 7/7 after the final
mapping change; the seven remaining errors are merchant names. They still
escape automatic low-confidence warnings: review TP/FP/FN/TN changes from
9/1/6/33 to 0/2/7/40. The two final VAT warnings are intentional checks on degraded
labels whose recovered amounts happen to be correct. Mandatory human comparison
of every field remains necessary; alert calibration is not established.

The first engine candidate with the old strict mapper scored 40/49 and regressed
VAT on the skew and small-PDF cases despite retaining the printed `7.00`. Final
42/49 results use saved, genuinely executed raw OCR replayed through the original
Desktop benchmark helper with the final mapper **on both sides**. This mapping
rescore performed zero new model runs; it does not replace the raw CER or timing.

## Reproducibility and limits

- Baseline source: `ccaf7a7026e6faffee0da3177116b9defb063b86`; engine SHA-256
  `fa49e79be8c0b4310e9793ee59087336362f5d03ff3560f67dfad34c53ee7216`.
  Candidate engine SHA-256:
  `2c1202159cd7a473883ab2312cdce78f283ba11189b90b3f5ac2d8d04bea1824`.
  Final mapper SHA-256:
  `b1f9a6f8e7b57df6ae629ba7c28608481945fe50f11faa1302c6bd1cfc420a40`.
- Python 3.12.14, PaddleOCR 3.7.0, PaddlePaddle 3.3.0 CPU, Pillow 11.3.0,
  pypdfium2 5.13.0; existing cached mobile detector/Thai recognizer. EasyOCR,
  Torch, Thai-TrOCR and native Tesseract were unavailable and not measured.
- Seven predetermined cases use one layout and one fully synthetic merchant.
  Chromium Canvas2D shapes repository TH Sarabun New; Pillow on this host lacks
  RAQM, so its unshaped generator was not used. Font SHA-256:
  `5f313df437c7b80e1a8ef2afad821279c21010d49a71a9fa571d171de5376858`.
  Ground truth retains image/font hashes and all text including the test banner.
  The raster PDF is A4, 2480×3508 pixels, 300 DPI with 22 px body type (5.28 pt),
  a small-print stress case. No private receipts, paid API calls or model downloads.
- Windows 11 Pro, Ryzen 5 5600X (6 physical/12 logical cores), 32 GB RAM; OCR caps
  at four threads. Fresh worker per request with cached downloads, sequential
  inference, other machine work possible. Median worker time 9.618 → 13.486 s;
  maximum sampled process-tree RSS 699.5 → 761.7 MiB (20 ms sampling can miss
  peaks/double-count shared pages). Higher quality has a CPU/RAM cost.
- Frozen sources, fixture scripts/hashes, raw OCR, original model-run reports,
  and final `mapper-rescore/desktop-helper/` reports are retained under the task's
  `output/CC/2026/10/ocr-research/baseline/`. The benchmark README explains the
  runner and optional full-text references. Generated fixtures/models are not
  added to employee installers or Git.
- Also probed detector unclip ratios 1.2/1.5/1.8/2/2.5 on upright synthetic text.
  None fixed the merchant tone mark; a global margin/default-model change was
  therefore not adopted from this single example.
- Still untested: other Thai font/layout families, real thermal photos,
  perspective/shadows, large multipage scans, real handwriting, Windows 2-core
  and macOS M1/4 GB devices, and employee-confirmed documents. No version bump,
  installer publication, billing change or cloud rollout follows from this study.

## Regression verification

Python tests: 41 passed, two existing Linux-font-path skips. Desktop: clean
`npm ci`, format check, 906 tests passed/four platform skips, build passed.
Harness: 1060 passed/eight skips; repository validator and diff whitespace checks
passed. The native Windows receipt smoke uses fake OCR plus synthetic input;
it verifies visible VAT uncertainty, correction/confirmation/save, zero external
requests with existing API/cloud configuration, and refusal of API fallback.
It is separate from the actual seven-case model-inference evidence above.
An initial Harness run overlapped the dependency reinstall and was rerun after
installation; the private-trial guard rejected a fixture inside Git and passed
after the synthetic fixture was copied outside Git. No guard was bypassed.
