---
name: tor-review
description: ใช้เมื่อต้องตรวจ TOR/ขอบเขตงานก่อนส่ง AFP โดยเน้นความครบถ้วน ความสอดคล้อง ผลส่งมอบ เกณฑ์ตรวจรับ ความเป็นกลาง และ source-backed compliance; ไม่ใช้เพื่อเลือกผู้ชนะ อนุมัติจัดซื้อ หรือให้คำวินิจฉัยกฎหมาย
---

# STeP TOR Review

Skill นี้ทำ **pre-review** เพื่อช่วยเจ้าของเรื่องเตรียม TOR ให้ตรวจง่ายและลด rework ก่อนส่ง AFP

> **Method lives in the Skill. Current rules live in controlled sources.**

## Source Gate

ก่อนสรุปว่าข้อใด “ถูก/ผิดตามระเบียบ” ให้ตรวจสถานะ Source ที่เกี่ยวข้องใน `manifest/documents.yaml`

- ถ้า current AFP policy/checklist เป็น `active` และยืนยัน authority แล้ว → ใช้เป็น `ORGANIZATION_RULE`
- ถ้าเป็น `missing`, `provided-unverified` หรือ `pending-*` → ทำได้เฉพาะ structural/risk review และระบุ `NEED-SOURCE`
- ห้ามนำเลขมาตรา อัตราค่าปรับ หนังสือเวียน เพดานราคา หรือ requirement ที่จำได้จากโมเดลมาใช้เป็น current rule

กฎหมาย/ระเบียบสาธารณะอาจใช้เป็น discovery/reference ได้ แต่คำตอบต้องแยกจากกฎภายในที่ AFP ยืนยัน

## Review Workflow

### 1. Identify TOR facts
สกัดจาก TOR โดยตรง:
- วัตถุประสงค์
- scope / activity
- deliverables
- quantity / specification
- dates / duration
- budget facts ที่ระบุ
- qualification / acceptance criteria
- dependencies / owner-provided inputs

สิ่งที่ไม่มีใน TOR ต้องเป็น `missing` หรือ `planning assumption` ไม่แต่งเติมเป็น fact

### 2. Internal consistency
ตรวจ:
- วัตถุประสงค์ ↔ scope
- scope ↔ deliverable
- deliverable ↔ acceptance criteria
- จำนวน/หน่วย/วัน/งบที่ขัดกัน
- dependency ที่ทำให้ส่งมอบไม่ได้

### 3. Measurable acceptance
เกณฑ์ตรวจรับควรตอบได้ว่า:
- ตรวจอะไร
- ด้วยหลักฐาน/วิธีใด
- ใครตรวจตาม source/authority ที่เกี่ยวข้อง
- เมื่อไรถือว่าส่งมอบครบ

Flag คำเช่น “คุณภาพดี”, “เหมาะสม”, “สวยงาม”, “มาตรฐานสูง” เมื่อไม่มีเกณฑ์วัดหรือ reference

### 4. Neutral specification
ชี้ข้อกำหนดที่อาจเจาะจง brand/model/vendor โดยไม่เห็นเหตุผลใน source และเสนอให้เจ้าของเรื่อง/AFP ตรวจ necessity

ห้ามตัดสิน legality ขั้นสุดท้ายเอง

### 5. Source-backed compliance
ตรวจเฉพาะกฎที่มี source/current revision ที่ resolve ได้ เช่น:
- procurement rule
- current template/checklist
- approved budget/approval memo
- current technical standard

ทุก finding ที่เป็น rule ต้องอ้าง source/status ได้

### 6. Severity
ใช้ working status:
- `SOURCE-RULE-ISSUE` — ขัดกับ current verified source
- `STRUCTURAL-RISK` — TOR ขัดกัน/ตรวจรับไม่ได้/ส่งมอบไม่ชัด
- `NEED-CLARIFICATION` — ข้อมูลกำกวม/ขาด
- `NEED-SOURCE` — ต้องใช้กฎหรือ revision ที่ยังยืนยันไม่ได้

## Output Contract

### TOR Review Summary
| Finding | Status | TOR evidence | Source/Rule | Why it matters | Suggested fix |
|---|---|---|---|---|---|

ตามด้วย:
- Missing information
- Source gaps
- Questions for AFP / owner
- Structural readiness: `READY-FOR-AFP-REVIEW` / `NEEDS-REVISION`

คำว่า `READY-FOR-AFP-REVIEW` หมายถึงพร้อมส่งให้ AFP ตรวจต่อ ไม่ใช่อนุมัติจัดซื้อ

## Handoff

- ต้องแตก TOR เป็น WBS/Timeline → `tor-to-project-plan`
- ต้องเขียน TOR → `tor-government-writing`
- ต้องตัดสินผู้ชนะ/ให้คะแนน → Human procurement authority
- ต้องวินิจฉัยกฎหมาย → Human legal authority

## Privacy & Authority

ก่อนอ่านเอกสารแนบให้ใช้ Privacy Gate และลด PII ที่ไม่จำเป็น

AI ห้าม:
- เลือก/ให้คะแนนผู้ยื่นข้อเสนอแทนคณะกรรมการ
- อนุมัติงบหรือจัดซื้อจัดจ้าง
- อนุมัติ exception/waiver
- ให้ legal opinion ที่มีผลผูกพัน
