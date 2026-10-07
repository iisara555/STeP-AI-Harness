# STeP Local Thai OCR — Standalone Experiment

สถานะ: **Local OCR component สำหรับ STeP Desktop / standalone trial** (`v0.2`)

> Component นี้อยู่ใน source Desktop 0.5.23 ของ branch `main`; เวอร์ชัน standalone `v0.2` ไม่ใช่เลขเวอร์ชัน Desktop. ดู [คู่มือ Desktop](../../desktop/README.md) และ [สถานะ release](https://github.com/iisara555/STeP-AI-Harness/releases?q=desktop-v). Acceptance gate กับเอกสารจริงยัง **OPEN**.

เป้าหมายคือทดสอบ OCR ภาษาไทยบนเครื่องพนักงานโดยไม่ส่งเอกสารไปยัง OCR cloud API และไม่ผูกเข้ากับ Router/Skill ของ Harness จนกว่าจะมีผลทดสอบจากเอกสารจริงเพียงพอ

## ความสามารถปัจจุบัน

- PDF ที่มี text layer: อ่านข้อความตรงด้วย pypdfium2/PDFium ก่อน ไม่ทำ OCR โดยไม่จำเป็น
- PDF scan / PNG / JPG / TIFF / WebP: ใช้ **PaddleOCR PP-OCRv5 Thai** บน CPU
- แสดงข้อความ, confidence ต่อบรรทัด, bounding box และรายการที่ควรตรวจซ้ำ
- ตั้ง threshold สำหรับ `needs_review`
- Optional/lazy-loaded Thai-TrOCR provides unverified candidates for low-confidence lines or lines where the OCR engines disagree.
- Thai-TrOCR candidate เป็น second opinion เท่านั้น ระบบไม่แทนค่าข้อความเดิมอัตโนมัติ
- Optional EasyOCR Thai/English recognition cross-checks PaddleOCR's detected lines, including lines with high PaddleOCR confidence. Different readings are flagged for human review; neither reading replaces the other automatically.
- ถ้าเครื่องมี **Tesseract 5 + `tha` + `eng` traineddata** ระบบจะใช้เป็น independent verifier สำหรับตัวพิมพ์และตัวเลขโดยอัตโนมัติ ไม่ใช้ Tesseract เป็นผู้ตัดสินลายมือ
- ระบบจัดประเภทบรรทัดเป็น `printed-likely`, `handwriting-likely`, `printed-conflict` หรือ `uncertain` จากการเห็นพ้อง/ขัดกันของ PaddleOCR, Tesseract และ Thai-TrOCR
- STeP Desktop มี AI candidate filter: หลัง OCR บน connection แบบ text-only จะเลือก candidate หลัง consent; สั่งตรวจซ้ำด้วยปุ่มได้ ส่งเฉพาะข้อความที่ผ่าน privacy masking และ candidate token **ไม่ส่งภาพใบเสร็จ** และไม่ยอมรับค่าที่ AI สร้างใหม่
- มี Web UI ในเครื่องที่ `http://127.0.0.1:8765`
- ไฟล์ชั่วคราวถูกลบหลังประมวลผล

## OCR/mapping ใน source Desktop 0.5.23

- แยก subtotal / VAT amount / paid total ตาม label และความสัมพันธ์ทางคณิตศาสตร์ ไม่ตีความ VAT rate เป็นจำนวนเงิน; ค่าที่คำนวณเติมยังต้องตรวจเทียบต้นฉบับ
- รองรับเลขที่/No., label ไทยที่เว้นวรรค วันที่เดือนอังกฤษ และตัวเลขที่เว้นวรรคข้าง separator; ตัดบรรทัดเงินสด/ที่อยู่ออกจากชื่อร้าน ไม่แทนตัวอักษรในยอดเงินเป็นเลขเอง
- ถ้า text boxes บ่งชี้ภาพตะแคง จะอ่านเพิ่มสอง quarter turns แล้วเลือก reading score ที่ดีกว่า; ไม่ใช่การรับรอง auto-deskew ทุกมุม
- detection side default 1280 px (`STEP_OCR_DET_SIDE`) และ PDF scan 200 DPI. ภาพโทรศัพท์ใช้ EXIF orientation และภาพซีดใช้ bounded contrast normalization; native-text PDF ข้าม PaddleOCR startup

Tests ของการเปลี่ยนนี้เป็น synthetic/mocked regressions. รายงาน [50/63 → 59/63 ของรอบ 0.5.21](benchmark/QUALITY-RESULTS-2026-10-06.md) เป็นหลักฐานก่อนการเปลี่ยน 0.5.23 ไม่ใช่ accuracy ปัจจุบันหรือผลกับเอกสารจริง. ต้องวัดภาพจริง เวลา และ RAM บนเครื่องพนักงานใหม่ก่อนปิด gate.

## Receipt review workflow

The local page is designed for preparing STeP expense reimbursement evidence. Open `Start-OCR.bat` for each session, keep its server window running, then choose a receipt image or PDF in the page. The status badge and retry control show whether the local OCR service is reachable.

The standalone Web UI has per-field checkboxes and a manually entered expense note. Desktop uses its own form with one source-comparison checkbox, source-backed item descriptions and a preparation checklist; its AI modes are described below.

After OCR, the standalone page proposes the merchant, receipt number, date, tax ID, subtotal, VAT, and paid total. These are OCR suggestions. Compare each value against the receipt, correct it, and mark the populated field as checked. The review list also flags missing required values, a subtotal/VAT/total mismatch, incomplete tax ID length, and OCR lines below the confidence threshold. The expense note is entered manually.

High-resolution images are read in overlapping tiles after a bounded resize. This preserves more detail while keeping each OCR call small. A total label and amount on the same visual row can be paired even when OCR returns them as separate lines. A tax ID found only in the buyer/customer section is not proposed as the issuer's tax ID. The original OCR lines remain visible; reviewers can correct a separate text draft without overwriting that evidence. Corrected text and original OCR are both included in the JSON draft.

The draft can be downloaded as JSON or copied to the clipboard. It contains the OCR output and may contain personal or financial data, so store it according to the organization's data classification rules. The “fields checked” state records document review only; it does not approve reimbursement or validate tax compliance. Receipt extraction heuristics and accuracy still require pilot testing with authorized sample documents.

OCR service/engine ยัง **ไม่** ถูกลงทะเบียนเป็น Router Skill หรือ Playbook และยังไม่เพิ่ม table-structure model. Standalone ไม่ใช้ privacy preflight/output manager ของ Harness; Desktop มี attachment, candidate-filter, vision และ chat gates แยกตามโหมด การส่งผลที่คนตรวจเข้าแชตไม่ใช่การผูก engine เข้ากับ Router.

**STeP Desktop mini app:** แอป Desktop มีเครื่องมือ “ตรวจใบเสร็จ AFP” (ป้าย *ทดลอง*) ที่เรียก service นี้ที่ `127.0.0.1:8765` โดยตรง ใช้ `web/receipt-review.js` ชุดเดียวกัน และใช้ runtime ใน App Data ที่ติดตั้งผ่าน Desktop หรือ `.venv` ของ standalone ที่พร้อมใช้อยู่แล้ว เครื่องมือนี้ยังไม่ผ่าน Router; ปุ่ม “ให้ AI ตรวจทานต่อ” ส่งค่าที่คนเลือกและตรวจแล้ว พร้อม JSON ที่ยังมี OCR ดิบ/candidate เข้า chat ปกติ โดยเลือก `receipt-audit` ได้ หรือให้ Router เลือกเมื่อเปิด `autoRouting`) ค่าที่ตรวจเทียบต้นฉบับแล้วเป็น `SOURCE_FACT`; OCR/vision ดิบและ candidate อื่นยังเป็น `EXTRACTED_UNVERIFIED`; ค่าที่กรอกเองแต่ยังไม่ตรวจเป็น `USER_INPUT` การยืนยันส่งไม่ใช่การยืนยันค่า และการยืนยันค่าไม่ใช่การอนุมัติเบิก Acceptance gate ด้านล่างยังใช้กับการผูก OCR เข้ากับ Router

Receipt vision has a separate boundary from the masked candidate filter: it sends
images to the connected provider only with its existing consent/policy conditions
(`features.vision`, `features.receiptVision`, and privacy checks off). With privacy
checks enabled, receipt vision is disabled. Chat handoff follows the current chat
privacy/consent policy. This work does not change either default or consent scope.

## Privacy boundary

ตัว web server bind ที่ `127.0.0.1` เท่านั้นโดย default. เอกสารที่ทดลองจะถูกส่งจาก browser ไปยัง process บนเครื่องเดียวกันและเก็บไว้ใน temporary directory ระหว่างการประมวลผลเท่านั้น.

สิ่งที่ยังต้องใช้อินเทอร์เน็ต:

1. ตอนติดตั้ง Python packages
2. ครั้งแรกที่ PaddleOCR ต้องดาวน์โหลด model weights หากยังไม่มีใน cache
3. ครั้งแรกที่เปิด Thai-TrOCR หากยังไม่มี model weights ใน Hugging Face cache
4. The first EasyOCR cross-check may download its Thai recognition model if it is not cached. Model download does not upload receipt bytes.
5. Tesseract ไม่ได้ bundle มากับ installer หลัก; ถ้าต้องการชั้นนี้ให้ติดตั้ง Tesseract 5 และภาษา `tha` + `eng` ตามเอกสาร upstream แล้ว Desktop จะตรวจพบเอง
6. ใน Desktop, candidate filter อาจติดต่อ provider หลัง OCR สำหรับ connection แบบ text-only เมื่อมี consent หรือเมื่อกดตรวจซ้ำ โดยส่ง token + evidence ที่ผ่าน privacy gate; receipt vision ส่งภาพแยกภายใต้ consent/policy ไม่ได้อยู่ใน local-only OCR path

ต้องการทดสอบแบบ local-only ใน Desktop ให้เลือก **ทดลอง OCR ในเครื่อง (สำหรับใบที่เลือกครั้งถัดไป)** ก่อนเปิดเอกสาร โหมดนี้หยุดการเรียก AI อัตโนมัติ เก็บเอกสารจริงและผล JSON นอก Git checkout. การอ่านภาพหรือส่งแชตภายหลังเป็นการส่งข้อมูลแยกที่ผู้ใช้เลือกเอง

**Model download ไม่ใช่ document upload** แต่เครื่องที่ต้อง air-gap ควรเตรียม dependency/model cache ล่วงหน้าก่อนนำไปใช้.

## เริ่มทดลอง — Windows

1. ติดตั้ง Python 3.10–3.13 แบบ 64-bit ถ้ายังไม่มี
2. เปิด `Install-OCR.bat`
3. เปิด `Start-OCR.bat`
4. Browser จะเปิดหน้า Local Thai OCR ให้อัตโนมัติ

## เริ่มทดลอง — macOS

1. ใช้ Python 3.10–3.12 จาก python.org/Homebrew
2. First run: `chmod +x Install-OCR.command Start-OCR.command Install-Handwriting.command Install-Crosscheck.command`
3. เปิด `Install-OCR.command`
4. เปิด `Start-OCR.command`

> macOS ใช้ CPU inference. PaddlePaddle ไม่ต้องใช้ GPU สำหรับ prototype นี้.

## เปิด handwriting fallback (optional)

Thai-TrOCR ใช้ PyTorch/Transformers และหนักกว่า core OCR อย่างชัดเจน จึงไม่ติดตั้งโดย default.

Windows: เปิด `Install-Handwriting.bat`

macOS: เปิด `Install-Handwriting.command`

Enable the Thai-TrOCR checkbox in the local page to show handwriting candidates separately from PaddleOCR and EasyOCR. Human review is required.

## Optional Tesseract verifier

Tesseract เป็นชั้นตรวจซ้ำสำหรับ **ตัวพิมพ์และตัวเลข** เท่านั้น โดยใช้ `tha+eng`, OEM 1 และ line-level recognition บนบริเวณที่ PaddleOCR ตรวจพบอยู่แล้ว. ถ้า Tesseract กับ PaddleOCR อ่านต่างกัน ระบบจะตั้ง `needs_review` และเก็บทั้งสอง candidate.

STeP Desktop ตรวจ Tesseract จาก `TESSERACT_CMD`, PATH และตำแหน่งติดตั้งทั่วไปของ Windows/macOS. ต้องมีทั้งภาษา `tha` และ `eng`. การติดตั้งเป็น system-level dependency จึงไม่ถูกรวมในตัวติดตั้ง STeP Desktop; หน้า Receipt มีลิงก์ไปเอกสารติดตั้ง upstream.

**อย่าใช้ผล Tesseract เพื่อสรุปว่าเป็นลายมือโดยลำพัง.** สัญญาณ `handwriting-likely` ต้องมี candidate จาก Thai-TrOCR และ Tesseract ต้องอ่อน/ไม่เห็นพ้องตามกฎใน engine.

## Optional second OCR for printed receipts

Run `Install-Crosscheck.bat` on Windows or `Install-Crosscheck.command` on macOS after the core installer. This installs EasyOCR and caches its Thai/English recognition model. The local page enables the cross-check by default when the package is installed; the checkbox can be cleared for a faster PaddleOCR-only run. Restart the local server after updating the experiment files.

The second OCR reads the same detected text regions. The results table shows agreement, disagreement, or an uncertain alternative. A disagreement adds a review item even when PaddleOCR reports high confidence. The exported draft keeps the original OCR text, the alternative, and the review state. EasyOCR confidence is used only to suppress very weak alternatives; scores from different engines are not directly comparable. When enabled, Thai-TrOCR provides a separate handwriting candidate for low-confidence lines and disagreements, including disagreements on high-confidence PaddleOCR lines. Its work is limited to 20 lines per document.

The second model is a review aid, not an accuracy guarantee. Validate both readings against the receipt image. At most 80 regions per tile and 100 regions per document are cross-checked, prioritizing low-confidence lines and the start/end of each tile. Native PDF text layers bypass both OCR engines.

## Developer entry point

```sh
.venv/bin/python app.py --no-browser
```

Windows:

```bat
.venv\Scripts\python.exe app.py --no-browser
```

Health check:

```text
GET http://127.0.0.1:8765/api/health
```

OCR request ใช้ raw file bytes:

```text
POST /api/ocr?filename=sample.pdf&threshold=0.80&handwriting=off&crosscheck=on&tesseract=on
Content-Type: application/octet-stream
```

## Acceptance gate ก่อนเชื่อมเข้า Harness

อย่า merge logic นี้เข้ากับ Router หลักจนกว่าจะตอบคำถามต่อไปนี้จาก pilot ได้:

- เอกสารไทยพิมพ์ปกติอ่านผิดบ่อยแค่ไหน
- ตัวเลข/จำนวนเงิน/เลขที่หนังสือผิดบ่อยแค่ไหน
- ตารางแบบใดที่ OCR ได้แค่ข้อความแต่เสียโครงสร้าง
- handwriting fallback ช่วยจริงกับเอกสาร STeP หรือทำให้ผิดมากขึ้น
- RAM/เวลาเฉลี่ยบนเครื่องพนักงานจริงเป็นเท่าไร
- threshold ใดทำให้ `needs_review` มีประโยชน์โดยไม่เตือนมากเกินไป

ใช้ `TEST-PLAN.md` บันทึกผลก่อนตัดสินใจ integration.

Developer tooling: [synthetic benchmark and private pilot](benchmark/README.md)
generates 80 paired Thai receipt images for H–O, scores independent OCR/vision and
combined readings, and measures processing time/RAM. Synthetic/replay results do
not close this gate. Authorized real-document inputs, answers and outputs stay
outside the public checkout. Target pilot machines: Windows 2 cores and macOS M1
4 GB RAM; the repository owner decides the acceptance thresholds after baseline review.

## หมายเหตุด้านความเบา

OCR applies phone EXIF orientation before recognition and normalizes contrast only
when the image's 0.5–99.5 percentile tonal span is 12–95 levels. This adds no model
pass, records preprocessing, and preserves the original source file. Flat pages
and ordinary contrast are left alone. Tile-overlap lines that
the owning tile missed are retained with a review flag; conflicting tile readings
remain candidates, never confirmed values. Decimal points/signs/reference separators
are preserved by independent cross-checks. Receipt mapping uses detector polygons
for mild-skew row alignment, excludes explicitly labeled buyer IDs from seller IDs,
and keeps malformed amounts empty for source review.

Native-text PDF requests avoid importing PaddleOCR. CPU threads are bounded by
the available logical cores (maximum four); image/model limits and optional engines
remain unchanged. Run `npm test` at the repository root for quality regressions;
install the existing core Python dependencies or set `STEP_OCR_TEST_PYTHON` to
their environment. A missing core environment is reported as a skipped engine test,
not a passing OCR run. No image-generation fonts are shipped in the employee app.

`th_PP-OCRv5_mobile_rec` เป็น recognition model ขนาดเล็ก แต่ PaddleOCR runtime และ text detector ใช้ทรัพยากรมากกว่าขนาด model file. Prototype นี้จึง:

- บังคับ CPU
- ปิด orientation classifier
- ปิด document unwarping
- ปิด text-line orientation
- โหลด model เมื่อมีคำขอ OCR ครั้งแรก
- อ่าน PDF text layer โดยตรงเมื่อทำได้
- ไม่โหลด Thai-TrOCR จนกว่าผู้ใช้จะเลือก
- ยังไม่โหลด table/layout pipeline เพิ่ม

## License / third-party

Prototype ไม่ bundle model weights หรือ source ของ third party เข้ามาใน repository. PDF path ใช้ pypdfium2/PDFium ซึ่งมี license แบบ permissive ตาม upstream; binary redistribution ยังต้องแนบ license ของ PDFium dependencies ที่เกี่ยวข้อง. ตรวจ `THIRD-PARTY-NOTICE.md` ก่อนทำ installer สำหรับแจกจริง.
