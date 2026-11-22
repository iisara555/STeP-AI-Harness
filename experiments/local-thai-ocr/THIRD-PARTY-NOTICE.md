# Third-party notice

This experiment intentionally does **not** vendor model weights or third-party source code.

Core:
- PaddleOCR / PaddlePaddle: follow upstream project licenses and redistribution terms.
- pypdfium2: Apache-2.0 / BSD-3-Clause per upstream; PDFium uses a BSD-style license and binary redistributions must include applicable bundled dependency licenses.
- Pillow: follow upstream license.

Optional handwriting fallback:
- `openthaigpt/thai-trocr`: model card states Apache-2.0.
- PyTorch / Transformers: follow upstream licenses.

Optional printed-text cross-check:
- EasyOCR and its Thai recognition model: follow upstream licenses and model redistribution terms.
- PyTorch, torchvision, OpenCV, and other EasyOCR dependencies: follow upstream licenses.

Optional Typhoon OCR (downloaded on request by STeP Desktop, never vendored):
- `typhoon-ai/typhoon-ocr2-0.8b-GGUF` (Typhoon OCR V2 0.8B, SCB 10X): model card states Apache-2.0.
- Prompt, image preparation and decoding follow the `typhoon-ocr2` client 0.2.0 (Apache-2.0; derived from `scb-10x/typhoon-ocr`, Apache-2.0).
- llama.cpp release `b12464` binaries (`llama-server` and its libraries): MIT; the Windows build also ships LLVM OpenMP (`libomp.dll`, Apache-2.0 with LLVM exception).

Before STeP distributes a prebuilt installer containing dependencies or model files, perform a separate license and redistribution review. Keeping this prototype source-only avoids implying that third-party binaries/models are already approved for redistribution.
