---
name: receipt-audit
description: ใช้เมื่อต้อง pre-check ใบเสร็จ ใบกำกับภาษี ใบแจ้งหนี้ หรือชุดเอกสารเบิกก่อนส่ง AFP โดยเทียบข้อเท็จจริงข้ามเอกสารกับ current verified sources; ไม่ใช้เพื่ออนุมัติเบิก กำหนดสิทธิ หรือแต่งเพดาน/รายการเอกสารเมื่อ Source ยังไม่ยืนยัน
standardVersion: 2
---

# STeP Receipt & Disbursement Pre-check

## Purpose

ตรวจความครบถ้วนและความสอดคล้องของหลักฐานการเบิกจ่าย ก่อนเจ้าหน้าที่ AFP ตรวจจริง เพื่อลดการตีกลับ

หลักสำคัญ: **Evidence first และกฎการเงินปัจจุบันต้องมาจากแหล่งการเงินปัจจุบัน**

## เมื่อควรใช้

- pre-check ใบเสร็จ ใบกำกับภาษี หรือใบแจ้งหนี้ก่อนส่ง AFP
- ตรวจชุดเอกสารเบิกว่าครบและสอดคล้องกันหรือไม่
- ตอบคำถามว่าเอกสารชุดนี้ยังขาดอะไร

**Anti-trigger:**
- ต้องการอนุมัติเบิกหรือสั่งจ่าย เป็นอำนาจของ AFP
- ตรวจ TOR หรือเอกสารจัดซื้อ ให้ใช้ `tor-review`
- เอกสารมีข้อมูลส่วนบุคคลจำนวนมาก ให้ใช้ `data-privacy-compliance` ควบคู่

## Inputs

ใช้เท่าที่มีและจำเป็น:
- receipt, invoice หรือ e-document
- approval memo หรือ project approval
- PO, quotation, delivery หรือ inspection evidence
- current policy, checklist หรือ source reference

ถ้าขาดเอกสารบริบท ให้ตรวจเฉพาะสิ่งที่พิสูจน์ได้จากเอกสารที่มี

## Source

**Source Gate** — อ่านสถานะ Source ใน `manifest/documents.yaml` ก่อนใช้กฎการเงิน

- Current AFP หรือ CMU source ที่ยืนยันแล้ว → ใช้เป็น rule พร้อม source reference
- Source `missing`, `not-provided`, `pending-*` หรือ `provided-unverified` → **ห้ามสรุปว่าเบิกได้หรือไม่ได้แน่นอน**
- `references/receipt-rules-cmu.md` เป็น working review guide ไม่ใช่ current controlled finance policy
- [แนวปฏิบัติงาน AFP](../../../docs/afp-operational-circulars.md) — Lead Time งานการเงิน/พัสดุ, หมวด B/BV/B9.2, การจ้างเหมารถตู้, ข้อควรระวังการยืมเงิน และ E-Signature เป็นแนวปฏิบัติที่ AFP แจ้งเวียน ใช้อ้างอิงได้พร้อมระบุที่มา **ถ้าขัดกับระเบียบกระทรวงการคลังให้ยึดระเบียบ**
- [ลำดับชั้นระเบียบงานการเงินและพัสดุ](../../../docs/afp-regulation-hierarchy.md) — AFP ไม่ได้ส่งแนวปฏิบัติเบิกจ่ายฉบับ STeP จึงใช้บอกได้แค่ว่าเรื่องนี้น่าจะอยู่ใต้ข้อบังคับ มช. ฉบับไหน **มีแต่ชื่อฉบับ ห้ามอ้างเลขข้อ วงเงิน หรืออัตราจากความจำ**

**ห้าม hard-code หรือเดาจากความจำ:** เพดานค่าใช้จ่าย, required document set, buyer หรือ tax identity, VAT และ tax treatment, travel entitlement, exception หรือ waiver

**เมื่อผู้ใช้ถามว่าเรื่องจะเสร็จเมื่อไหร่:** ตอบ Lead Time จากเอกสาร AFP พร้อมเงื่อนไขเสมอว่า **นับเมื่อเอกสารครบถ้วนถูกต้องแล้วเท่านั้น และเริ่มนับใหม่ถ้ามีการแก้ไขเอกสาร** และต้องเตือนเรื่อง[ปฏิทินปิดรับเอกสารรายเดือน](https://cmu.to/CalendarFinancial2026) ห้ามตอบเป็นจำนวนวันลอย ๆ

## Workflow

เมื่อเทียบยอด ใช้ [คู่มือตรวจยอดและฐานภาษี](references/arithmetic-review.md) และ [การจัดรูปแบบวันที่/ตัวเลข](../../../docs/thai-data-formatting.md) ไม่คัดลอกอัตราภาษีจากตัวอย่างมาเป็นกฎปัจจุบัน

1. **Document facts** — สกัด document type, number, date, issuer และ buyer fields เท่าที่จำเป็น, items, quantity, amount, tax fields และ referenced project หรือ PO เมื่อมี
2. **Arithmetic & internal consistency** — ตรวจ subtotal, tax, total, quantity คูณ unit price, ค่าที่ซ้ำหรือขัดกัน และความครบของ field ที่ source ปัจจุบันกำหนด
3. **Cross-document consistency** — เทียบ receipt ↔ approval, receipt ↔ PO/quotation, receipt ↔ delivery/acceptance ทั้ง date, item, amount และ vendor identity **การไม่ตรงกันให้ flag เป็น evidence mismatch ไม่ใช่ตัดสินว่าเป็นการทุจริต**
4. **Policy checks** — ทำเฉพาะข้อที่มี current verified source เช่น expense ceiling, tax หรือ document requirement, required attachments, eligible period หรือ category และ special approval ถ้าไม่มี source ให้ `NEED-SOURCE`
5. **Privacy** — mask หรือ minimize national ID, personal bank account, personal address, phone, email และข้อมูลสุขภาพ การตรวจว่าตรงกันหรือไม่ใช้ token เช่น `PERSON_001` แทนชื่อจริงได้

## Output

ดู [ตัวอย่างตรวจยอดกับแหล่งภาษีที่ยังขาด](examples/arithmetic-review.md) เมื่อตัวเลขตรงกันแต่ยังยืนยันเงื่อนไขไม่ได้

Worked synthetic examples: [conflicting unverified readings](examples/synthetic-precheck.md)
and [balanced amounts with a missing current policy](examples/missing-current-source.md).
These are methodology examples, not real-document accuracy or model-side evaluation evidence.

Preserve `EXTRACTED_UNVERIFIED` on OCR/AI readings until a person compares the
selected value with the source. Only that checked value becomes `SOURCE_FACT`;
raw readings and alternatives stay unverified. A manual value without source
comparison is `USER_INPUT`. Transmission consent, model agreement and confidence
do not verify a value or authorize payment. Calculations from unverified readings
are conditional checks; do not present them as established `DERIVED_FACT`.

### Receipt Pre-check

| Check | Status | Evidence | Source | Next action |
|---|---|---|---|---|
| Document facts | PASS / FLAG / NEED-INFO | … | document | … |
| Arithmetic | PASS / FLAG | … | document | … |
| Cross-document match | PASS / FLAG / NEED-INFO | … | source docs | … |
| Policy requirement | VERIFIED / NEED-SOURCE | … | current source | … |

**Overall:** `READY-FOR-AFP-REVIEW` / `NEEDS-DOCUMENT-FIX` / `NEEDS-MORE-EVIDENCE` / `NEEDS-CURRENT-SOURCE`

**สถานะเหล่านี้ไม่ใช่การอนุมัติเบิกจ่าย**

## Authority

AI ทำได้: pre-check, mismatch detection, รายการหลักฐานที่ขาด และรายการ source gap

AI ห้าม:
- อนุมัติสั่งจ่ายหรือเบิก — `budget-allocation`
- อนุมัติข้อยกเว้น — `policy-waiver`
- สรุป policy ใหม่จาก case เก่า
- เปลี่ยนวงเงินหรือสิทธิของผู้เบิก

Final decision อยู่กับ AFP และผู้มีอำนาจตาม current organization source

## Handoff

- ตรวจข้อกำหนด AFP ปัจจุบันและเอกสารแปลประกอบ → [afp-operations-lookup](../afp-operations-lookup/SKILL.md)
- อ่านความหมายเอกสารต่างภาษา → [thai-english-translation](../thai-english-translation/SKILL.md); ร่างแปลไม่ใช่คำแปลรับรองและไม่ยืนยันสิทธิเบิก
- ร่างบันทึกนำส่ง/ขอพิจารณาจากผลตรวจ → [thai-official-documents](../thai-official-documents/SKILL.md); คง FLAG และ NEED-SOURCE จากผลตรวจไว้
- เอกสารต้องแก้หรือขาด → เจ้าของเรื่อง
- ประเด็นกฎการเงินที่ยังไม่มี source → AFP
- ข้อมูลส่วนบุคคลในเอกสาร → `data-privacy-compliance`
- ตรวจความพร้อมก่อนบอกว่าครบ → `evidence-before-approval`

พร้อมส่งต่อเมื่อ: ทุก check มีสถานะ และรายการที่ `NEED-SOURCE` ระบุว่าต้องถามใคร

## Guardrails

- ไม่สรุปว่าเบิกได้หรือไม่ได้เมื่อ source ยังไม่ยืนยัน
- ไม่แต่งเพดานค่าใช้จ่ายหรือรายการเอกสารที่ต้องแนบ
- ไม่ตัดสินเจตนาของผู้เบิกจากความไม่ตรงกันของเอกสาร
- mask ข้อมูลส่วนบุคคลก่อนแสดงผลหรือเก็บ output
