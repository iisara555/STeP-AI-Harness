---
name: iso9001-audit-readiness
description: เตรียมความพร้อม External/Internal Audit ISO 9001 แบบ process-based สำหรับ 22 ทีมของ STeP โดยตรวจ scope, criteria, process profile, evidence, KPI, risk, records และ prior findings ก่อนวัน audit โดยไม่ประกาศ conformity แทนผู้ตรวจหรือ QS
---

# STeP ISO 9001 Audit Readiness

> **Audit the real process, not the checklist.** เริ่มจากสิ่งที่ทีมทำจริงและหลักฐานจริง แล้วจึงเชื่อมกับเกณฑ์ audit ที่ยืนยันแล้ว

Skill นี้เป็น Orchestrator สำหรับการเตรียม audit ไม่ใช่ตัวแทน Auditor, Certification Body หรือ QMR

## ใช้เมื่อ
- “เตรียม External Audit ISO 9001”
- “ช่วยเตรียมเอกสารสำหรับ audit ISO ปีนี้”
- “ทีมเราพร้อม audit หรือยัง”
- surveillance / recertification / internal audit readiness
- ต้องการ mock readiness ของทีมก่อน auditor เข้ามา

## Criteria Gate — ต้องทำก่อน
ระบุให้ได้:
- Audit type: Internal / External / Surveillance / Recertification / Transition
- Criteria / edition ที่ auditor จะใช้
- Audit scope และหน่วยงาน/บริการที่อยู่ใน scope
- Audit period / evidence period
- วัน fieldwork หรือ deadline ส่งหลักฐาน
- Prior findings / open CAPA ถ้ามี

ถ้า edition หรือ criteria ยังไม่ชัด ให้แสดง **CRITERIA UNCONFIRMED** และใช้ audit plan / เอกสารจาก Certification Body / QS เป็น Source of Truth ห้ามเดาจากปีปฏิทิน

## Process-First Readiness

สำหรับแต่ละทีม ให้ทำ Process Profile ก่อน:

1. **Purpose** — ทีม/กระบวนการนี้สร้างคุณค่าอะไร
2. **Input** — รับ requirement / request / resource จากไหน
3. **Activities** — ทำงานจริงอย่างไร
4. **Output** — ส่งมอบอะไร ให้ใคร
5. **Owner / Roles** — ใครรับผิดชอบ
6. **Criteria** — เกณฑ์ยอมรับ / SLA / requirement ที่ใช้
7. **Performance** — KPI/quality objective และผลล่าสุด
8. **Risk / Opportunity** — อะไรทำให้ผลลัพธ์ไม่เป็นไปตามเป้า หรือดีขึ้นได้
9. **Evidence / Records** — หลักฐานว่า process ทำงานจริง
10. **Improvement** — ปัญหา, complaint, audit finding, corrective action, lesson learned

จากนั้นจึง map กับ audit criteria ที่ยืนยันแล้ว

## Readiness Flow

### 1. Scope & Process
- scope ตรงกับ audit plan หรือไม่
- process owner รู้ขอบเขตของตัวเองหรือไม่
- upstream/downstream interface ชัดหรือไม่

### 2. Evidence
ส่งต่อ `audit-evidence-matrix` เพื่อทำรายการหลักฐาน
- หลักฐานต้องตรงกับ process และ period
- เอกสารปัจจุบันไม่ทดแทน record ของช่วงเวลาที่ auditor จะตรวจ
- ห้ามสร้างย้อนหลังเพื่อทำให้ดูว่ากระบวนการเคยเกิดขึ้น

### 3. Document & Record
ส่งต่อ `document-record-control`
- current document
- approval / revision
- obsolete prevention
- record traceability / retention

### 4. Performance
ส่งต่อ `quality-objective-kpi-review`
- objective → metric → source → actual → action
- ถ้า KPI ต่ำกว่าเป้า ต้องมีการวิเคราะห์/ตอบสนอง ไม่ใช่แค่กราฟ

### 5. Risk & Opportunity
ส่งต่อ `qms-risk-opportunity-review`
- risk/opportunity ต้องสัมพันธ์กับ process
- action ต้องมี owner/evidence

### 6. People & Interview
ใช้ `audit-interview-coach`
- พนักงานอธิบาย “สิ่งที่ทำจริง” ได้
- รู้ว่าจะเปิดหลักฐานจากไหน
- ไม่ท่อง policy หรือเดาคำตอบ

### 7. Findings & Improvement
ถ้ามี NC/CAPA ใช้ `ncr-capa`
ถ้าต้องรวมภาพองค์กร/ผู้บริหาร ใช้ `management-review-prep`

## Readiness Status

ใช้เพียง:
- **READY** — มี process + evidence + owner และไม่มี gap สำคัญที่รู้แล้วแต่ยังไม่จัดการ
- **PARTIAL** — มีหลักฐานบางส่วน แต่มี gap/period/owner ที่ต้องปิด
- **GAP** — requirement/process/evidence ที่จำเป็นยังไม่มีหรือไม่ทำจริง
- **NOT-IN-SCOPE** — ยืนยันจาก audit scope แล้วว่าไม่อยู่ในขอบเขต

ห้ามใช้คำว่า `ISO PASSED`, `CERTIFIED`, `COMPLIANT` เป็นข้อสรุปของ AI

## Authority

AI ช่วยเตรียม readiness brief, evidence gap และ action list ได้ แต่:
- ห้ามประกาศว่าองค์กร/ทีม `ISO PASSED`, `CERTIFIED` หรือ `COMPLIANT`
- การตัดสิน conformity/finding เป็นอำนาจของ Auditor/QS/QMR ตามบทบาทจริง
- การรับรองหรือปิด audit finding/CAPA ต้องใช้ human review และหลักฐานที่ตรวจย้อนกลับได้
- สถานะ `READY` ใน Skill นี้หมายถึง “พร้อมสำหรับการตรวจตาม evidence ที่มี” ไม่ใช่ผลรับรอง ISO

## Output

### Team Audit Readiness Brief
- Team / Process:
- Audit type / Criteria:
- Scope:
- Process owner:
- Readiness: READY / PARTIAL / GAP
- Evidence coverage:
- KPI / objective status:
- Risk / opportunity status:
- Document / record issues:
- Prior NC/CAPA:
- Interview readiness:
- Top gaps before audit:
- Owner / due date:
- Human review required: QS / Process Owner / QMR

## Guardrails
- ไม่แต่ง evidence, record, signature, approval, audit date หรือ auditor request
- ไม่ classify finding อย่างเป็นทางการแทน auditor/QS
- ไม่เปลี่ยน paper gap ให้ดู conforming ด้วยการเขียนเอกสารใหม่โดยไม่มีการปฏิบัติจริง
- ถ้ามี PII/ข้อมูลลับ ส่งต่อ `data-privacy-compliance`
- ก่อนบอกว่า READY ใช้ `evidence-before-approval`

## Method note
เขียนใหม่สำหรับ STeP โดยศึกษาแนวทาง process-based audit จาก RBraga01/Quality-Engineering-Skills (`iso-9001-internal-audit`, MIT), evidence preparation จาก smerphy/cyber-grc-agent-skills (`audit-preparation`, MIT) และ verification discipline จาก obra/superpowers (MIT) โดยไม่คัดลอก checklist หรือข้อความมาตรฐาน ISO
