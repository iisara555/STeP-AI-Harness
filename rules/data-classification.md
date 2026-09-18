# Data Classification & Privacy Gate

จัดข้อมูลก่อนส่งให้ AI หรือเก็บใน repository โดยใช้หลัก **เก็บเท่าที่จำเป็น ปิดบังก่อนส่ง และให้มนุษย์ยืนยันเมื่อความเสี่ยงสูง**

## ระดับข้อมูล

- **Public — ทั่วไป:** เผยแพร่แล้ว ใช้งานได้ตามปกติ
- **Internal — ภายใน:** ใช้ภายในองค์กรได้ แต่ไม่ควรเผยแพร่ภายนอกโดยไม่มีการตรวจ
- **Restricted — จำกัดการเข้าถึง:** ข้อมูลส่วนบุคคล การเงิน สัญญา การจัดซื้อ ข้อเสนอที่ยังไม่ประกาศ ข้อมูลลูกค้า เลขบัญชี เลขประจำตัว ที่อยู่ส่วนตัว ลายมือชื่อ หรือข้อมูลรับรองตัวตน
- **Sensitive — อ่อนไหว/ความเสี่ยงสูง:** ข้อมูลสุขภาพ ประวัติอาชญากรรม ข้อมูลชีวภาพ หรือข้อมูลอ่อนไหวอื่นที่กฎหมาย/นโยบายองค์กรกำหนดให้ควบคุมเป็นพิเศษ

เมื่อไม่แน่ใจ ให้จัดเป็น Restricted และให้เจ้าของกระบวนการหรือผู้มีอำนาจยืนยันก่อน

## Lightweight Privacy Gate

ใช้ก่อนส่งข้อมูลเข้า AI โดยไม่เพิ่ม Workflow ใหม่:

```text
Input
  ↓
Quick Local Scan
  ↓
Public/Internal ─────────────→ ใช้งานตามปกติหรือปิดบังเท่าที่จำเป็น
Restricted ──────────────────→ Auto-mask ก่อนส่ง AI
Sensitive / High Risk ───────→ Human Confirmation หรือ Block external AI
```

### กติกา

1. **Local-first:** ตรวจรูปแบบข้อมูลที่ชัดเจนบนเครื่องก่อน เช่น เลขประจำตัว 13 หลัก เบอร์โทร อีเมล เลขบัญชี และที่อยู่
2. **Minimize first:** ถ้าข้อมูลนั้นไม่จำเป็นต่อคำตอบ ให้ตัดออกแทนการส่งไปทั้งฉบับ
3. **Mask before model:** ปิดบังข้อมูลส่วนบุคคลที่ไม่จำเป็นก่อน AI เห็น
4. **No automatic OCR:** ถ้า PDF/รูปภาพไม่มี text layer อย่า OCR ทั้งไฟล์อัตโนมัติ ให้ประมวลผลเฉพาะเมื่อจำเป็นต่อ Task
5. **Hash/cache:** ไฟล์หรือข้อความเดิมสามารถใช้ผล scan เดิมได้เพื่อไม่เพิ่ม latency ซ้ำ
6. **No raw PII in logs:** ห้ามเก็บชื่อจริง เลขประจำตัว เลขบัญชี ที่อยู่ เบอร์โทร ลายมือชื่อ หรือข้อมูลอ่อนไหวลง Run State, event log, feedback หรือ diagnostic log
7. **Metadata only:** Run Log เก็บได้เฉพาะ hash, privacy class, action และสถานะ redaction
8. **Human gate:** หากพบข้อมูลอ่อนไหวร่วมกับตัวระบุบุคคล ให้หยุดการส่งไป AI ภายนอกโดยอัตโนมัติ
9. **Approved tools only:** ข้อมูล Restricted/Sensitive ใช้เฉพาะเครื่องมือหรือช่องทางที่องค์กรอนุมัติ
10. **Delete when no longer needed:** สำเนาที่สร้างเพื่อ redaction หรือ preprocessing ต้องไม่ถูกเก็บเกินความจำเป็นของงาน

## ตัวอย่าง Metadata ที่เก็บได้

```json
{
  "sourceHash": "...",
  "containsPersonalData": true,
  "privacyClass": "restricted",
  "privacyAction": "auto-mask",
  "redactionApplied": true
}
```

ห้ามเก็บข้อมูลดิบของบุคคลไว้ใน metadata ดังกล่าว

## คำสั่งตรวจแบบ Local

สำหรับไฟล์ข้อความ:

```bash
step-ai privacy --file sample.txt
step-ai privacy --file sample.txt --redact
```

คำสั่งนี้ไม่ OCR PDF หรือรูปภาพอัตโนมัติ เพื่อให้เร็วและไม่ประมวลผลข้อมูลเกินจำเป็น
