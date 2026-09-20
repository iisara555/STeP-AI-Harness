---
name: iso9001-audit-readiness
description: เตรียมความพร้อม External/Internal Audit ISO 9001 แบบ process-based สำหรับ 22 ทีมของ STeP โดยตรวจ scope, criteria, process profile, evidence, KPI, risk, records และ prior findings ก่อนวัน audit โดยไม่ประกาศ conformity แทนผู้ตรวจหรือ QS
standardVersion: 2
---

# STeP ISO 9001 Audit Readiness

## Purpose

เตรียมความพร้อมการตรวจประเมินแบบ process-based ให้แต่ละทีมรู้ว่า process จริงคืออะไร มีหลักฐานอะไร และเหลือ gap ใดก่อนวัน audit

หลักสำคัญ: **Audit the real process, not the checklist** — เริ่มจากสิ่งที่ทีมทำจริงและหลักฐานจริง แล้วจึงเชื่อมกับเกณฑ์ audit ที่ยืนยันแล้ว

Skill นี้เป็น Orchestrator สำหรับการเตรียม audit ไม่ใช่ตัวแทน Auditor, Certification Body หรือ QMR

## เมื่อควรใช้

- เตรียม External Audit ISO 9001 หรือ internal audit
- surveillance, recertification หรือ transition readiness
- คำถามแบบ "ทีมเราพร้อม audit หรือยัง"
- ต้องการ mock readiness ก่อนผู้ตรวจเข้ามา

**Anti-trigger:**
- ต้องการเพียงรายการหลักฐาน ให้ใช้ `audit-evidence-matrix`
- ต้องการซ้อมตอบผู้ตรวจ ให้ใช้ `audit-interview-coach`
- มี finding แล้ว ให้ใช้ `ncr-capa`

## Inputs

**Criteria Gate — ต้องระบุให้ได้ก่อนเริ่ม:**

- Audit type: Internal / External / Surveillance / Recertification / Transition
- Criteria และ edition ที่ผู้ตรวจจะใช้
- Audit scope และหน่วยงานหรือบริการที่อยู่ใน scope
- Audit period และ evidence period
- วัน fieldwork หรือ deadline ส่งหลักฐาน
- Prior findings และ open CAPA ถ้ามี

ถ้า edition หรือ criteria ยังไม่ชัด ให้แสดง **CRITERIA UNCONFIRMED** **ห้ามเดาจากปีปฏิทิน**

## Source

- audit plan และเอกสารจาก Certification Body หรือ QS เป็น Source of Truth ของ criteria
- มาตรฐานและเอกสารควบคุม resolve จาก `manifest/documents.yaml`
- หลักฐานต้องมาจาก record จริงในช่วงเวลาที่ตรวจ

## Workflow

**Process-First Readiness** — สำหรับแต่ละทีม ทำ Process Profile ก่อน: Purpose (สร้างคุณค่าอะไร), Input (รับ requirement, request หรือ resource จากไหน), Activities (ทำงานจริงอย่างไร), Output (ส่งมอบอะไร ให้ใคร), Owner/Roles, Criteria (เกณฑ์ยอมรับ SLA requirement), Performance (KPI หรือ quality objective และผลล่าสุด), Risk/Opportunity, Evidence/Records และ Improvement (ปัญหา complaint audit finding corrective action lesson learned) จากนั้นจึง map กับ audit criteria ที่ยืนยันแล้ว

1. **Scope & Process** — scope ตรงกับ audit plan หรือไม่ process owner รู้ขอบเขตตัวเองหรือไม่ upstream และ downstream interface ชัดหรือไม่
2. **Evidence** — ส่งต่อ `audit-evidence-matrix` หลักฐานต้องตรงกับ process และ period เอกสารปัจจุบันไม่ทดแทน record ของช่วงเวลาที่ผู้ตรวจจะตรวจ
3. **Document & Record** — ส่งต่อ `document-record-control` ตรวจ current document, approval/revision, obsolete prevention, record traceability และ retention
4. **Performance** — ส่งต่อ `quality-objective-kpi-review` เชื่อม objective → metric → source → actual → action ถ้า KPI ต่ำกว่าเป้าต้องมีการวิเคราะห์และการตอบสนอง ไม่ใช่แค่กราฟ
5. **Risk & Opportunity** — ส่งต่อ `qms-risk-opportunity-review` risk ต้องสัมพันธ์กับ process และ action ต้องมี owner กับ evidence
6. **People & Interview** — ใช้ `audit-interview-coach` ให้พนักงานอธิบายสิ่งที่ทำจริงได้และรู้ว่าจะเปิดหลักฐานจากไหน
7. **Findings & Improvement** — ถ้ามี NC หรือ CAPA ใช้ `ncr-capa` ถ้าต้องรวมภาพองค์กรใช้ `management-review-prep`

**Readiness Status:** READY (มี process, evidence, owner และไม่มี gap สำคัญที่ยังไม่จัดการ), PARTIAL (มีหลักฐานบางส่วน แต่มี gap, period หรือ owner ที่ต้องปิด), GAP (requirement, process หรือ evidence ที่จำเป็นยังไม่มีหรือไม่ทำจริง), NOT-IN-SCOPE (ยืนยันจาก audit scope แล้ว)

## Output

### Team Audit Readiness Brief

- Team / Process
- Audit type / Criteria
- Scope
- Process owner
- Readiness: READY / PARTIAL / GAP
- Evidence coverage
- KPI / objective status
- Risk / opportunity status
- Document / record issues
- Prior NC/CAPA
- Interview readiness
- Top gaps before audit
- Owner / due date
- Human review required: QS / Process Owner / QMR

## Authority

AI ช่วยได้: เตรียม readiness brief ระบุ evidence gap และจัดทำ action list

AI ห้าม:
- ประกาศว่าองค์กรหรือทีม `ISO PASSED`, `CERTIFIED` หรือ `COMPLIANT`
- ตัดสิน conformity หรือ finding ซึ่งเป็นอำนาจของ Auditor, QS และ QMR — `iso-qms-enactment`
- รับรองหรือปิด audit finding และ CAPA

**สถานะ `READY` หมายถึงพร้อมสำหรับการตรวจตาม evidence ที่มี ไม่ใช่ผลรับรอง ISO**

## Handoff

- รายการหลักฐาน → `audit-evidence-matrix`
- เอกสารและ record → `document-record-control`
- KPI → `quality-objective-kpi-review`
- ความเสี่ยง → `qms-risk-opportunity-review`
- ซ้อมสัมภาษณ์ → `audit-interview-coach`
- finding และ CAPA → `ncr-capa`
- ภาพรวมสำหรับผู้บริหาร → `management-review-prep`
- PII หรือข้อมูลลับ → `data-privacy-compliance`

ก่อนบอกว่า READY ให้ใช้ `evidence-before-approval`

## Guardrails

- ไม่แต่ง evidence, record, signature, approval, audit date หรือ auditor request
- ไม่ classify finding อย่างเป็นทางการแทน auditor หรือ QS
- **ไม่เปลี่ยน paper gap ให้ดู conforming ด้วยการเขียนเอกสารใหม่โดยไม่มีการปฏิบัติจริง**
- ห้ามสร้างหลักฐานย้อนหลังเพื่อทำให้ดูว่ากระบวนการเคยเกิดขึ้น

## Method note

เขียนใหม่สำหรับ STeP โดยศึกษาแนวทาง process-based audit จาก RBraga01/Quality-Engineering-Skills (`iso-9001-internal-audit`, MIT), evidence preparation จาก smerphy/cyber-grc-agent-skills (`audit-preparation`, MIT) และ verification discipline จาก obra/superpowers (MIT) โดยไม่คัดลอก checklist หรือข้อความมาตรฐาน ISO
