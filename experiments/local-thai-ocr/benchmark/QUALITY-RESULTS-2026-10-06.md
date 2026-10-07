# Synthetic OCR quality evidence — 2026-10-06

Baseline: main `0241b3f` (Desktop 0.5.19). Candidate: the OCR changes accompanying this file.
This measures generated documents only; **the real-document acceptance gate remains OPEN**.
No real documents, live vision, EasyOCR, Tesseract or Thai-TrOCR were used in these model runs.

## Inputs and reproduction

Nine images: seeded H–O (`count=1`, seed 20261005) plus `N-phone-exif`.
The same image bytes and paired answers were used before and after. The two expected
absences (I/reference and L/seller ID) are included in the counts below; these are
seven-field comparisons, not a recognition-only accuracy percentage.

Use the existing CPU PaddleOCR models (`PP-OCRv5_mobile_det`, `th_PP-OCRv5_mobile_rec`)
and the existing core environment. Host: Linux x86_64,
5 logical CPUs. Package versions: PaddleOCR 3.7.0,
PaddlePaddle 3.3.0, Pillow 11.3.0.
Downloads were cached; each document started a new OCR worker. This is not warm-model latency.

```sh
python -m benchmark.generate --font /path/to/NotoSerifThai-Regular.ttf \
  --fallback-font /path/to/DejaVuSans.ttf --count 1 --seed 20261005 \
  --include-phone-rotation --output /private/synthetic-nine
python -m benchmark.run --input /private/synthetic-nine \
  --output /private/new-run --mode ocr --limit 9 --cache-state cached-downloads
```

Thai font SHA-256: `8e1bcaa4fef346b247092cf4327c4744eda2fa72afed96e2145dc30a3b04fdd1`.
Fallback font SHA-256: `57f73e11f51999432bf7ab22ce55b6f945d5eca1bf824404cfa9ec2e3718c84e`.
The initial run using a Thai-only font rendered digits as missing-glyph boxes and
was discarded. Neither its outputs nor intermediate tuning runs enter this table.
Full images, raw OCR, readings and resource samples were kept outside Git; this file
contains aggregate synthetic evidence only.

## Field comparisons

| Field | Before canonical matches | After canonical matches |
| --- | ---: | ---: |
| Merchant | 6/9 | 7/9 |
| Reference | 8/9 | 9/9 |
| Date | 7/9 | 9/9 |
| Seller tax ID | 7/9 | 9/9 |
| Subtotal | 8/9 | 9/9 |
| VAT | 7/9 | 8/9 |
| Paid total | 7/9 | 8/9 |
| Total | 50/63 | 59/63 |

Final errors: two merchant transcriptions differ from their answer; thermal paid
total and the sheared-print VAT are left empty for source review. The sheared image
is simulated handwriting stress, not evidence of real handwriting recognition.
No remaining error was labeled a financial approval.

Review signals before: TP 8, FP 1, FN 5, TN 49.
After: TP 2, FP 4, FN 2, TN 55.
Two wrong merchant values still escaped automatic warnings. Mandatory human
confirmation is excluded from these confusion counts and remains required.
Small denominators and this one font/layout family do not establish general accuracy,
alert calibration or readiness on employee hardware.

## Native-text PDF startup

A separate generated native-text PDF ran in three fresh Python processes per revision,
without model initialization or other OCR runs in parallel. Median request wall time:
**2.322 → 0.279 seconds**.
Maximum sampled process-tree RSS: **150.4 → 33.1 MiB**.
This supports lazy PaddleOCR imports for native text. It does not measure scanned PDF
recognition, first model download, minimum RAM, or Windows/macOS performance.
Image OCR timings from this single run are exploratory and support no speed guarantee.
RSS sums can double-count shared pages; 20 ms sampling can miss short peaks.

## Image timing limits

Nine-image median OCR worker wall time was **9.808 → 13.592 s**;
maximum sampled RSS was **917.0 → 922.2 MiB**.
Because the image median increased, an additional alternating check used the same
normal-contrast H image, in fresh workers, after other tests finished:

| Alternating run | Baseline seconds | Candidate seconds |
| --- | ---: | ---: |
| 1 | 16.978 | 11.742 |
| 2 | 12.522 | 10.224 |

The timing direction changed between runs. Neither sample establishes a general
image speed improvement or regression; employee-host repeated measurements remain
necessary. The nine-image accuracy comparison and native-PDF import reduction are
reported separately from these exploratory image timings.

## Candidate runtime fingerprints

- `ocr_engine.py`: `9710ab3657d6d118331234b31a469986c433820870d91e089ed24f0aaf00480c`
- `crosscheck.py`: `72ceed6641ea4c3e65a8bda661ae58482d64faafaa0af534935a147e51ba9f48`
- `web/receipt-review.js`: `d6c69043c6c3321bba08d13ac82b3e297186b10e88b5cbea305ebc1dd155f585`
- `benchmark/score.py`: `578a114cf68523663c39a7f89a61f70a00e5f3063f08c16617e0328cf7134d82`
