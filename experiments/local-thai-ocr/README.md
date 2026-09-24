# STeP Local Thai OCR — Standalone Experiment

สถานะ: **ทดลองแยกจาก STeP AI Harness หลัก** (`v0.1`)

เป้าหมายคือทดสอบ OCR ภาษาไทยบนเครื่องพนักงานโดยไม่ส่งเอกสารไปยัง OCR cloud API และไม่ผูกเข้ากับ Router/Skill ของ Harness จนกว่าจะมีผลทดสอบจากเอกสารจริงเพียงพอ

## ขอบเขต v0.1

- PDF ที่มี text layer: อ่านข้อความตรงด้วย pypdfium2/PDFium ก่อน ไม่ทำ OCR โดยไม่จำเป็น
- PDF scan / PNG / JPG / TIFF / WebP: ใช้ **PaddleOCR PP-OCRv5 Thai** บน CPU
- แสดงข้อความ, confidence ต่อบรรทัด, bounding box และรายการที่ควรตรวจซ้ำ
- ตั้ง threshold สำหรับ `needs_review`
- ทดลอง **Thai-TrOCR** เฉพาะบรรทัด confidence ต่ำได้แบบ optional/lazy-load
- Thai-TrOCR candidate เป็น second opinion เท่านั้น ระบบไม่แทนค่าข้อความเดิมอัตโนมัติ
- มี Web UI ในเครื่องที่ `http://127.0.0.1:8765`
- ไฟล์ชั่วคราวถูกลบหลังประมวลผล

## Receipt review workflow

The local page is designed for preparing STeP expense reimbursement evidence. Open `Start-OCR.bat` for each session, keep its server window running, then choose a receipt image or PDF in the page. The status badge and retry control show whether the local OCR service is reachable.

After OCR, the page proposes the merchant, receipt number, date, tax ID, subtotal, VAT, and paid total. These are OCR suggestions. Compare each value against the receipt, correct it, and mark the populated field as checked. The review list also flags missing required values, a subtotal/VAT/total mismatch, incomplete tax ID length, and OCR lines below the confidence threshold. The expense note is entered manually.

The draft can be downloaded as JSON or copied to the clipboard. It contains the OCR output and may contain personal or financial data, so store it according to the organization's data classification rules. The “fields checked” state records document review only; it does not approve reimbursement or validate tax compliance. Receipt extraction heuristics and accuracy still require pilot testing with authorized sample documents.

ยัง **ไม่** เชื่อมกับ Router, Skill registry, Playbook, privacy preflight หรือ output manager ของ Harness หลัก และยังไม่เพิ่ม table-structure model ในรอบนี้.

## Privacy boundary

ตัว web server bind ที่ `127.0.0.1` เท่านั้นโดย default. เอกสารที่ทดลองจะถูกส่งจาก browser ไปยัง process บนเครื่องเดียวกันและเก็บไว้ใน temporary directory ระหว่างการประมวลผลเท่านั้น.

สิ่งที่ยังต้องใช้อินเทอร์เน็ต:

1. ตอนติดตั้ง Python packages
2. ครั้งแรกที่ PaddleOCR ต้องดาวน์โหลด model weights หากยังไม่มีใน cache
3. ครั้งแรกที่เปิด Thai-TrOCR หากยังไม่มี model weights ใน Hugging Face cache

**Model download ไม่ใช่ document upload** แต่เครื่องที่ต้อง air-gap ควรเตรียม dependency/model cache ล่วงหน้าก่อนนำไปใช้.

## เริ่มทดลอง — Windows

1. ติดตั้ง Python 3.10–3.13 แบบ 64-bit ถ้ายังไม่มี
2. เปิด `Install-OCR.bat`
3. เปิด `Start-OCR.bat`
4. Browser จะเปิดหน้า Local Thai OCR ให้อัตโนมัติ

## เริ่มทดลอง — macOS

1. ใช้ Python 3.10–3.12 จาก python.org/Homebrew
2. ครั้งแรก: `chmod +x Install-OCR.command Start-OCR.command Install-Handwriting.command`
3. เปิด `Install-OCR.command`
4. เปิด `Start-OCR.command`

> macOS ใช้ CPU inference. PaddlePaddle ไม่ต้องใช้ GPU สำหรับ prototype นี้.

## เปิด handwriting fallback (optional)

Thai-TrOCR ใช้ PyTorch/Transformers และหนักกว่า core OCR อย่างชัดเจน จึงไม่ติดตั้งโดย default.

Windows: เปิด `Install-Handwriting.bat`

macOS: เปิด `Install-Handwriting.command`

จากนั้นติ๊ก `Thai-TrOCR สำหรับบรรทัด confidence ต่ำ` ในหน้าเว็บ. Candidate ที่ได้จะถูกแสดงแยกจาก PaddleOCR เพื่อให้คนตรวจเอง.

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
POST /api/ocr?filename=sample.pdf&threshold=0.80&handwriting=off
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

## หมายเหตุด้านความเบา

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
