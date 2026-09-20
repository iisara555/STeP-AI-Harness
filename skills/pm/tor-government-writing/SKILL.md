---
name: tor-government-writing
description: ใช้เมื่อต้องสร้างหรือแก้ร่าง TOR งานจัดซื้อจัดจ้างของ STeP จาก project facts และ current verified sources โดยทำข้อกำหนด/ผลส่งมอบ/เกณฑ์ตรวจรับให้ traceable; ไม่ใช้เพื่อกำหนดกฎพัสดุเอง เลือกผู้ชนะ หรือรับรองว่า TOR พร้อมประกาศ
standardVersion: 2
---

# STeP TOR Government Writing

## Purpose

สร้าง **ร่าง TOR เพื่อให้ AFP และเจ้าของเรื่องตรวจต่อ** ไม่ใช่การอนุมัติ TOR หรือการให้ความเห็นทางกฎหมาย

หลักสำคัญ: **ร่างจากข้อเท็จจริง resolve กฎจาก source และไม่เปลี่ยนความจำของโมเดลให้เป็นนโยบายพัสดุ**

## เมื่อควรใช้

- ต้องยกร่าง TOR ใหม่จากข้อมูลโครงการ
- ต้องแก้ร่าง TOR เดิมให้ข้อกำหนดและเกณฑ์ตรวจรับ traceable

**Anti-trigger:**
- ต้องการตรวจร่างที่มีอยู่แล้ว ให้ใช้ `tor-review`
- ต้องแตก TOR เป็นแผนงาน ให้ใช้ Playbook `tor-to-project-plan`
- ต้องเลือกผู้ชนะหรือให้คะแนน เป็น human procurement authority

## Inputs

- project objective และ background
- scope และ desired outcome
- deliverables, quantity, location
- dates, constraints, dependencies
- approved budget facts เมื่อมี
- current template, policy, checklist หรือ source
- owner, reviewer และ approver ที่ยืนยันแล้ว

สิ่งที่ยังไม่รู้ให้ใช้ `รอยืนยัน` พร้อมระบุเจ้าของคำตอบ

## Source

**Source Gate** — ก่อนใช้กฎ แบบฟอร์ม อัตรา วัน ระยะรับประกัน เกณฑ์ผู้ยื่นข้อเสนอ หรือข้อความบังคับ ให้ resolve จาก `manifest/documents.yaml` และ source ปัจจุบัน

- `active` และยืนยัน authority แล้ว → ใช้เป็น organization rule ได้
- `missing`, `provided-unverified` หรือ `pending-*` → ใส่ `รอยืนยัน` และห้ามแต่ง rule
- template ใช้เป็นโครงได้ แต่ต้องตรวจ version และ current status

รายละเอียดที่เปลี่ยนได้ เช่น ค่าปรับ เกณฑ์ราคา หนังสือเวียน คุณสมบัติผู้เสนอ และ technical threshold **ต้องอยู่ใน source ไม่ใช่ในความจำของ Skill**

## Workflow

1. **Classify the procurement need** — ระบุประเภทงานตามข้อมูลและ source ที่ได้รับ โดยไม่เดาวิธีจัดซื้อหรือข้อกฎหมายที่ยังไม่ยืนยัน
2. **Build fact table**

   | Topic | Value | Source | Status |
   |---|---|---|---|
   | Objective | … | … | verified / pending |
   | Deliverable | … | … | … |
   | Budget | … | … | … |
   | Date | … | … | … |

3. **Draft structure** — ใช้ current template ที่ resolve ได้ ถ้าไม่มีให้ใช้โครงกลาง: ความเป็นมา, วัตถุประสงค์, Scope/specification, Deliverables, Timeline/delivery, Acceptance criteria, Budget facts/payment basis ที่ source รองรับ, Dependencies/owner-provided inputs, Required qualifications เฉพาะที่มี source, Attachments/references

   `templates/tor-16-sections-template.md` ใช้เป็น working template ได้ แต่ current official structure ต้องยืนยันกับ AFP

4. **Make requirements testable** — ทุก deliverable สำคัญเชื่อม `Need → Requirement → Evidence/Test → Acceptance condition` **ห้ามสร้างจำนวน ขนาด spec รอบแก้ไข SLA benchmark หรือ threshold เอง**
5. **Neutrality & competition review** — ชี้ requirement ที่อาจล็อก brand/model/vendor หรือจำกัดการแข่งขันโดยไม่มี evidence ใน source แล้วส่งให้ owner หรือ AFP ยืนยัน
6. **Traceability** — ทำตาราง Objective / Requirement-Activity / Deliverable / Acceptance / Source
7. **Source gaps** — แยกท้ายร่างเป็น Current rules resolved, Pending AFP confirmation, Missing source และ Planning assumptions

## Output

ส่งอย่างน้อย:

1. TOR draft พร้อมสถานะ `ร่างเพื่อพิจารณา`
2. Fact / source table
3. Traceability matrix
4. Missing information และ source gaps
5. Questions for AFP หรือ project owner

**ห้ามเขียนว่า `พร้อมประกาศ`, `ถูกต้องตามกฎหมาย` หรือ `AFP อนุมัติแล้ว` หากไม่มีหลักฐานจริง**

## Authority

AI ช่วยได้: ยกร่าง จัดโครงสร้าง ทำ traceability และชี้ source gap

AI ไม่อนุมัติ: งบประมาณ วิธีจัดซื้อ ผู้ชนะ exception หรือการลงนาม ตาม `manifest/authority.yaml` (`procurement-approval`, `budget-allocation`, `policy-waiver`, `official-signing`)

## Handoff

- ตรวจร่าง → `tor-review`
- แตกแผนหรือ Gantt → Playbook `tor-to-project-plan`
- vendor selection หรือ scoring → Human procurement authority
- legal interpretation → Human legal authority

พร้อมส่งต่อเมื่อ: ทุกข้อกำหนดมี source หรือสถานะ `รอยืนยัน` และเกณฑ์ตรวจรับทดสอบได้

## Guardrails

- ลด PII ในเอกสารแนบตาม Privacy Gate และไม่เก็บ raw personal หรือ vendor data ที่ไม่จำเป็นใน Run State
- ไม่แต่งกฎพัสดุ อัตรา หรือคุณสมบัติผู้เสนอจากความจำ
- ไม่สร้าง spec หรือ threshold ทางเทคนิคเองโดยไม่มี source
- ไม่ระบุสถานะการอนุมัติที่ยังไม่เกิดขึ้นจริง
