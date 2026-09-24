# Local Thai OCR — Pilot Test Plan

ใช้เอกสารตัวอย่างที่ไม่มี secret/credential และใช้ข้อมูลส่วนบุคคลเท่าที่จำเป็นตามกติกาองค์กร.

## ชุดทดสอบขั้นต่ำ

| Scenario | ตัวอย่าง | สิ่งที่ดู |
| --- | --- | --- |
| A. Thai printed | หนังสือ/บันทึกข้อความ 3 หน้า | ตัวอักษรไทย, วรรณยุกต์, เว้นวรรค |
| B. Thai + English | เอกสาร bilingual | การสลับภาษา |
| C. Critical numbers | ราคา, วันที่, เลขที่หนังสือ | digit accuracy |
| D. Scanned table | ตารางมีเส้น 1–2 หน้า | อ่านข้อความใน cell ได้หรือไม่; โครงสร้างหายตรงไหน |
| E. Low quality | ภาพมือถือเอียง/แสงไม่สม่ำเสมอ | detection + confidence |
| F. Handwriting | ลายมือไทยอย่างน้อย 20 บรรทัด | Paddle vs Thai-TrOCR candidate |
| G. Native PDF | PDF ที่เลือก copy text ได้ | ต้องใช้ text layer โดยไม่เรียก OCR |
| H. Receipt fields | Printed Thai reimbursement receipts | Merchant, receipt number, date, tax ID, subtotal, VAT, paid total against source |
| I. Receipt review | Missing or ambiguous values and low-confidence text | Manual correction, confirmation reset on edit, review checklist, draft JSON |
| J. Thermal receipts | Faded, crumpled, or cropped thermal paper | Readability and number accuracy; record fields that still require manual entry |
| K. High-resolution receipt | Image above 20 MP with small printed text | Tiled OCR stays available, critical values match the source, no duplicate lines at tile edges |
| L. Buyer tax ID | Receipt names a buyer and its tax ID but not an issuer tax ID | Issuer field stays blank and the buyer-number advisory appears |
| M. Split total row | Label and amount are separate OCR lines on the same row | Paid total is proposed from the aligned amount and still requires human confirmation |
| N. Dual OCR review | Printed Thai receipts with known ground truth, including difficult diacritics and numbers | Count true errors caught, false disagreement alerts, missed errors, added processing time, and review completion |

## เก็บผลต่อเอกสาร

- เครื่อง/CPU/RAM
- เวลาประมวลผล
- จำนวนหน้า
- จำนวนบรรทัด
- average confidence
- `needs_review`
- error ที่มีผลต่อความหมาย
- error ในข้อมูลสำคัญ: จำนวนเงิน/วันที่/เลขอ้างอิง/ชื่อ
- Thai-TrOCR ช่วย / ไม่ช่วย / แย่ลง
- ความเห็นผู้ใช้ว่า "ใช้ได้โดยไม่เสียเวลาตรวจมากเกินไปหรือไม่"

## เกณฑ์ตัดสินใจรอบแรก

ยังไม่กำหนด accuracy target ตายตัวก่อนเห็นข้อมูลจริง. ให้เก็บ baseline ก่อน แล้วค่อยกำหนด gate แยกตามประเภทข้อมูล โดยข้อมูลสำคัญต้อง conservative กว่าข้อความทั่วไป.

ผลที่ต้องการจากรอบแรกคือรู้ว่า:

1. PaddleOCR standalone เพียงพอสำหรับเอกสารพิมพ์หรือไม่
2. Handwriting fallback คุ้มกับขนาดและเวลาที่เพิ่มขึ้นหรือไม่
3. ตารางจำเป็นต้องมี table-structure module เพิ่มหรือไม่
4. เครื่องพนักงานระดับต่ำสุดที่ยังใช้งานได้คือสเปกประมาณใด
