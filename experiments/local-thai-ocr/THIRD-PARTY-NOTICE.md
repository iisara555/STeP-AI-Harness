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

Before STeP distributes a prebuilt installer containing dependencies or model files, perform a separate license and redistribution review. Keeping this prototype source-only avoids implying that third-party binaries/models are already approved for redistribution.
