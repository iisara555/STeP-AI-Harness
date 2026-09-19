---
name: receipt-audit
description: ใช้เมื่อต้อง pre-check ใบเสร็จ ใบกำกับภาษี ใบแจ้งหนี้ หรือชุดเอกสารเบิกก่อนส่ง AFP โดยเทียบข้อเท็จจริงข้ามเอกสารกับ current verified sources; ไม่ใช้เพื่ออนุมัติเบิก กำหนดสิทธิ หรือแต่งเพดาน/รายการเอกสารเมื่อ Source ยังไม่ยืนยัน
---

# STeP Receipt & Disbursement Pre-check

Skill นี้ช่วยตรวจความครบถ้วนและความสอดคล้องของหลักฐานก่อนเจ้าหน้าที่ AFP ตรวจจริง

> **Evidence first. Current finance rules must come from current finance sources.**

## Source Gate

อ่านสถานะ Source ใน `manifest/documents.yaml` ก่อนใช้กฎการเงิน

- Current AFP/CMU source ยืนยันแล้ว → ใช้เป็น rule พร้อม source reference
- Source `missing` / `pending-*` / `provided-unverified` → ห้ามสรุปว่า “เบิกได้/ไม่ได้แน่นอน”
- `references/receipt-rules-cmu.md` เป็น working review guide ไม่ใช่ current controlled finance policy

ห้าม hard-code หรือเดาจากความจำ:
- เพดานค่าใช้จ่าย
- required document set
- buyer/tax identity
- VAT/tax treatment
- travel entitlement
- exception/waiver

## Inputs

ใช้เท่าที่มีและจำเป็น:
- receipt / invoice / e-document
- approval memo / project approval
- PO / quotation / delivery/inspection evidence
- current policy/checklist/source reference

ถ้าขาดเอกสารบริบท ให้ตรวจเฉพาะสิ่งที่พิสูจน์ได้จากเอกสารที่มี

## Workflow

### 1. Document facts
สกัด:
- document type / number / date
- issuer / buyer fields เท่าที่จำเป็น
- items / quantity / amount / tax fields
- referenced project/PO เมื่อมี

### 2. Arithmetic & internal consistency
ตรวจ:
- subtotal/tax/total arithmetic
- quantity × unit price
- duplicated/conflicting values
- visible completeness ของ field ที่ source ปัจจุบันกำหนด

### 3. Cross-document consistency
เทียบ:
- receipt ↔ approval
- receipt ↔ PO/quotation
- receipt ↔ delivery/acceptance
- date / item / amount / vendor identity

การไม่ตรงกันให้ flag เป็น evidence mismatch ไม่ใช่ตัดสิน fraud

### 4. Policy checks
ทำเฉพาะข้อที่มี current verified source:
- expense ceiling
- tax/document requirement
- required attachments
- eligible period/category
- special approval

ถ้า source ไม่มี ให้ `NEED-SOURCE`

### 5. Privacy
Mask/minimize:
- national ID
- personal bank account
- personal address/phone/email
- health/other sensitive data

การตรวจ “ตรงกันหรือไม่” สามารถใช้ token เช่น `PERSON_001` แทนชื่อจริง

## Output Contract

### Receipt Pre-check
| Check | Status | Evidence | Source | Next action |
|---|---|---|---|---|
| Document facts | PASS / FLAG / NEED-INFO | … | document | … |
| Arithmetic | PASS / FLAG | … | document | … |
| Cross-document match | PASS / FLAG / NEED-INFO | … | source docs | … |
| Policy requirement | VERIFIED / NEED-SOURCE | … | current source | … |

### Overall
- `READY-FOR-AFP-REVIEW`
- `NEEDS-DOCUMENT-FIX`
- `NEEDS-MORE-EVIDENCE`
- `NEEDS-CURRENT-SOURCE`

สถานะเหล่านี้ไม่ใช่การอนุมัติเบิกจ่าย

## Handoff & Authority

AI ทำได้:
- pre-check
- mismatch detection
- missing evidence list
- source gap list

AI ห้าม:
- อนุมัติสั่งจ่าย/เบิก
- อนุมัติข้อยกเว้น
- สรุป policy ใหม่จาก case เก่า
- เปลี่ยนวงเงิน/สิทธิของผู้เบิก

Final decision อยู่กับ AFP/ผู้มีอำนาจตาม current organization source
