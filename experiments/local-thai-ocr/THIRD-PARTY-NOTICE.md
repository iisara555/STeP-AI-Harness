# Third-party notice

This experiment intentionally does **not** vendor model weights or third-party source code.

Core:
- PaddleOCR / PaddlePaddle: follow upstream project licenses and redistribution terms.
- PyMuPDF: review its license terms before packaging or redistributing a bundled application.
- Pillow: follow upstream license.

Optional handwriting fallback:
- `openthaigpt/thai-trocr`: model card states Apache-2.0.
- PyTorch / Transformers: follow upstream licenses.

Before STeP distributes a prebuilt installer containing dependencies or model files, perform a separate license and redistribution review. Keeping this prototype source-only avoids implying that third-party binaries/models are already approved for redistribution.
