---
name: ncr-capa
description: จัดการ Nonconformity และ Corrective Action ตั้งแต่บันทึกข้อเท็จจริง containment/correction, root cause, corrective action, effectiveness check จนถึงพร้อมส่งให้ QS/QMR ปิดอย่างเป็นทางการ
standardVersion: 2
---

# STeP NCR & CAPA

## Purpose

จัดการข้อบกพร่องและการแก้ไขอย่างเป็นระบบ ตั้งแต่บันทึกข้อเท็จจริง containment การหาสาเหตุเชิงระบบ การแก้ไข จนถึงการพิสูจน์ว่าได้ผลจริง ก่อนส่งให้ QS หรือ QMR ปิดอย่างเป็นทางการ

หลักสำคัญ: **อธิบายช่องว่างก่อน แล้วพิสูจน์สาเหตุก่อนแก้ระบบ**

ใช้กับ process, service, document และ audit findings ของ STeP ไม่จำกัดเฉพาะงานผลิต

## เมื่อควรใช้

- มี NCR, NC หรือ nonconformity
- ต้องทำ CAPA หรือ corrective action
- มี audit finding ที่ต้องตอบ
- ต้องหา root cause หลังพบปัญหาซ้ำ

**Anti-trigger:**
- ต้องแก้หรือเขียน SOP/WI ให้ใช้ `sop-authoring`
- ต้องรวบรวมหลักฐานก่อนตรวจ ให้ใช้ `audit-evidence-matrix`
- ต้องทบทวนความเสี่ยงเชิงระบบ ให้ใช้ `qms-risk-opportunity-review`

## Inputs

ขั้นต่ำ:
- ข้อกำหนดหรือ criteria ที่ควรเป็น
- สิ่งที่พบจริงพร้อมหลักฐาน

ช่วยให้ทำงานได้ครบขึ้นถ้ามี:
- ขอบเขตและกลุ่มที่ได้รับผลกระทบ
- ประวัติปัญหาเดียวกันที่เคยเกิด

## Source

- ข้อกำหนดต้อง resolve จาก controlled source ใน `manifest/documents.yaml` ไม่ตีความมาตรฐานเอง
- หลักฐานต้องชี้กลับไปยัง record ต้นทางได้
- **แยกคำให้ถูก:** Nonconformity (ข้อกำหนดที่ควรเป็น เทียบกับสิ่งที่พบจริง), Correction (แก้เหตุการณ์หรือผลลัพธ์ที่พบตอนนี้), Containment (ป้องกันผลกระทบแพร่ต่อระหว่างหาสาเหตุ), Root Cause (สาเหตุเชิงระบบที่มีหลักฐาน), Corrective Action (กำจัดสาเหตุเพื่อป้องกันการเกิดซ้ำ), Effectiveness Check (หลักฐานหลัง action ว่าปัญหาไม่กลับมา)

## Workflow

1. **Record the NC** — เขียนอย่างเป็นกลาง: Requirement/criteria, Actual observed condition, Objective evidence, Scope/affected population, Date/source, Immediate impact **ห้ามใส่ "เพราะว่า…" ใน NC ถ้ายังไม่ได้ทำ RCA**
2. **Correction / Containment** — สิ่งที่ทำทันที, owner, วันที่, หลักฐานว่า containment ได้ผล และผลกระทบที่ต้องตรวจย้อนหลัง
3. **Root Cause Analysis** — เริ่มจาก Fact และ Unknown ก่อน เลือกเครื่องมือเท่าที่จำเป็น: 5 Why, Fishbone, Is/Is-Not หรือ process walkthrough
4. **Corrective Action** — แต่ละ root cause ต้องมี action ที่สัมพันธ์กัน ระบุ action, owner, due date, document/process/training/system ที่เปลี่ยน, expected effect และ evidence to collect
5. **Effectiveness Check** — กำหนดล่วงหน้า: metric หรือ evidence, review period, success threshold และ reviewer

**สถานะ:** OPEN, CONTAINED, RCA-IN-PROGRESS, ACTION-IN-PROGRESS, EFFECTIVENESS-PENDING, READY-FOR-HUMAN-CLOSURE

## Output

### NCR/CAPA Record

- NC statement
- Requirement
- Evidence
- Containment / correction
- Root-cause hypotheses
- Validated root cause
- Corrective action
- Owner / due date
- Effectiveness method
- Current status
- Evidence gap
- Human closure required

## Authority

AI ช่วยได้: บันทึกข้อเท็จจริง วาง containment, RCA และ corrective action รวมถึงเตรียม effectiveness evidence

AI ห้าม:
- ประกาศ NC หรือ CAPA ว่า `CLOSED` หรือปิดอย่างเป็นทางการ
- ยืนยัน root cause, รับ corrective action หรือปิดงานแทน Process Owner, QS หรือ QMR — `iso-qms-enactment` ใน `manifest/authority.yaml`
- แก้ controlled SOP หรือ WI โดยไม่ผ่าน document control flow

ถ้าหลักฐาน effectiveness ยังไม่พอ ให้คงสถานะ `EFFECTIVENESS-PENDING` หรือ `READY-FOR-HUMAN-CLOSURE`

## Handoff

- SOP หรือ WI ต้องแก้ → `sop-authoring`
- training gap → `learning-designer`
- evidence verification → `evidence-before-approval`
- เอกสารหรือ revision ไม่ชัด → `document-record-control`
- official QMS closure → QS หรือ QMR

พร้อมส่งต่อเมื่อ: root cause มีหลักฐาน corrective action มีเจ้าของและกำหนดเวลา และกำหนดวิธีวัด effectiveness ไว้ล่วงหน้าแล้ว

## Guardrails

- Root cause ต้องมี evidence คำว่า "human error", "ลืม" หรือ "สื่อสารไม่ดี" เป็นจุดเริ่ม ไม่ใช่ final root cause จนกว่าจะอธิบายได้ว่าระบบเปิดช่องให้เกิดอย่างไร
- **ห้ามปิด CAPA เพราะทำ action ครบ ถ้ายังไม่มี effectiveness evidence**
- ไม่ระบุสาเหตุใน NC statement ก่อนทำ RCA
- ไม่ชี้ตัวบุคคลเป็นสาเหตุ การประเมินผลรายบุคคลเป็นอำนาจของ HD

## Method note

เขียนใหม่สำหรับ service และ process context ของ STeP จาก NCR, 8D, 5-Why และ PDCA patterns ใน RBraga01/Quality-Engineering-Skills (MIT) โดยตัด automotive-specific disposition และ terminology ออก
