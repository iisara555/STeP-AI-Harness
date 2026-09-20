---
name: ncr-capa
description: จัดการ Nonconformity และ Corrective Action ตั้งแต่บันทึกข้อเท็จจริง containment/correction, root cause, corrective action, effectiveness check จนถึงพร้อมส่งให้ QS/QMR ปิดอย่างเป็นทางการ
---

# STeP NCR & CAPA

> **Describe the gap first. Prove the cause before fixing the system.**

Skill นี้ใช้กับ process/service/document/audit findings ของ STeP ไม่ได้จำกัดงานผลิต

## ใช้เมื่อ
- NCR / NC / nonconformity
- CAPA / corrective action
- audit finding
- root cause หลังพบปัญหาซ้ำ
- “แก้ NC อย่างไร”

## แยกคำให้ถูก

- **Nonconformity (NC):** ข้อกำหนดที่ควรเป็น เทียบกับสิ่งที่พบจริง
- **Correction:** แก้เหตุการณ์/ผลลัพธ์ที่พบตอนนี้
- **Containment:** ป้องกันผลกระทบแพร่ต่อระหว่างหาสาเหตุ
- **Root Cause:** สาเหตุเชิงระบบที่มีหลักฐานรองรับ
- **Corrective Action:** กำจัดสาเหตุเพื่อป้องกันการเกิดซ้ำ
- **Effectiveness Check:** หลักฐานหลัง action ว่าปัญหาไม่กลับมา/ความเสี่ยงลดจริง

## Workflow

### 1. Record the NC
เขียนอย่างเป็นกลาง:
- Requirement / criteria
- Actual observed condition
- Objective evidence
- Scope / affected population
- Date / source
- Immediate impact

ห้ามใส่ “เพราะว่า…” ใน NC ถ้ายังไม่ได้ทำ RCA

### 2. Correction / Containment
- สิ่งที่ทำทันที
- owner
- วันที่
- หลักฐานว่า containment ได้ผล
- ผลกระทบที่ต้องตรวจย้อนหลัง

### 3. Root Cause Analysis
เริ่มจาก Fact / Unknown ก่อน
เลือกเครื่องมือเท่าที่จำเป็น:
- 5 Why
- Fishbone
- Is / Is-Not
- process walkthrough

Root cause ต้องมี evidence; “human error”, “ลืม”, “สื่อสารไม่ดี” เป็นจุดเริ่ม ไม่ใช่ final root cause จนกว่าจะอธิบายได้ว่าระบบเปิดช่องให้เกิดอย่างไร

### 4. Corrective Action
แต่ละ root cause ต้องมี action ที่สัมพันธ์กัน:
- action
- owner
- due date
- document/process/training/system ที่เปลี่ยน
- expected effect
- evidence to collect

### 5. Effectiveness Check
กำหนดล่วงหน้า:
- metric / evidence
- review period
- success threshold
- reviewer

ห้ามปิด CAPA เพราะ “ทำ action ครบ” ถ้ายังไม่มี effectiveness evidence

## Status
- OPEN
- CONTAINED
- RCA-IN-PROGRESS
- ACTION-IN-PROGRESS
- EFFECTIVENESS-PENDING
- READY-FOR-HUMAN-CLOSURE

AI ห้ามตั้งสถานะเป็น CLOSED อย่างเป็นทางการ

## Authority

AI ช่วยบันทึกข้อเท็จจริง วาง containment/RCA/corrective action และเตรียม effectiveness evidence ได้ แต่:
- ห้ามประกาศ NC/CAPA ว่า `CLOSED` หรือปิดอย่างเป็นทางการ
- การยืนยัน root cause, corrective action acceptance และ formal closure ต้องผ่าน Process Owner / QS / QMR ตามอำนาจจริง
- การแก้ controlled SOP/WI ต้องผ่าน document-control/approval flow ที่เกี่ยวข้อง
- ถ้าหลักฐาน effectiveness ยังไม่พอ ให้คงสถานะ `EFFECTIVENESS-PENDING` หรือ `READY-FOR-HUMAN-CLOSURE`

## Output

### NCR/CAPA Record
- NC statement:
- Requirement:
- Evidence:
- Containment / correction:
- Root-cause hypotheses:
- Validated root cause:
- Corrective action:
- Owner / due date:
- Effectiveness method:
- Current status:
- Evidence gap:
- Human closure required:

## Handoff
- SOP/WI ต้องแก้ → `sop-authoring`
- training gap → `learning-designer`
- evidence verification → `evidence-before-approval`
- official QMS closure → QS/QMR

## Method note
เขียนใหม่สำหรับ service/process context ของ STeP จาก NCR, 8D, 5-Why และ PDCA patterns ใน RBraga01/Quality-Engineering-Skills (MIT) โดยตัด automotive-specific disposition/terminology ออก
