---
name: tor-government-writing
description: ใช้เมื่อต้องสร้างหรือแก้ร่าง TOR งานจัดซื้อจัดจ้างของ STeP จาก project facts และ current verified sources โดยทำข้อกำหนด/ผลส่งมอบ/เกณฑ์ตรวจรับให้ traceable; ไม่ใช้เพื่อกำหนดกฎพัสดุเอง เลือกผู้ชนะ หรือรับรองว่า TOR พร้อมประกาศ
---

# STeP TOR Government Writing

Skill นี้ช่วยสร้าง **ร่างเพื่อ AFP/เจ้าของเรื่องตรวจต่อ** ไม่ใช่การอนุมัติ TOR หรือ legal opinion

> **Draft from facts. Resolve rules from sources. Never turn model memory into procurement policy.**

## Source Gate

ก่อนใช้กฎ แบบฟอร์ม อัตรา วัน ระยะรับประกัน เกณฑ์ผู้ยื่นข้อเสนอ หรือข้อความบังคับ ให้ resolve จาก `manifest/documents.yaml` และ source ปัจจุบัน

- `active` + verified authority → ใช้เป็น organization rule ได้
- `missing` / `provided-unverified` / `pending-*` → ใส่ `รอยืนยัน` และห้ามแต่ง rule
- template ใช้เป็นโครงได้ แต่ต้องตรวจ version/current status

รายละเอียดเฉพาะที่เปลี่ยนได้ เช่นค่าปรับ เกณฑ์ราคา หนังสือเวียน คุณสมบัติผู้เสนอ และ technical threshold ต้องอยู่ใน source ไม่ใช่ memory ของ Skill

## Inputs

- project objective / background
- scope and desired outcome
- deliverables / quantity / location
- dates / constraints / dependencies
- approved budget facts เมื่อมี
- current template/policy/checklist/source
- owner/reviewer/approver ที่ยืนยันแล้ว

สิ่งที่ยังไม่รู้ให้ใช้ `รอยืนยัน` พร้อม owner ของคำตอบ

## Draft Workflow

### 1. Classify the procurement need
ระบุประเภทงานตามข้อมูลและ source ที่ได้รับ โดยไม่เดาวิธีจัดซื้อหรือข้อกฎหมายที่ยังไม่ยืนยัน

### 2. Build fact table
| Topic | Value | Source | Status |
|---|---|---|---|
| Objective | … | … | verified / pending |
| Deliverable | … | … | … |
| Budget | … | … | … |
| Date | … | … | … |

### 3. Draft structure
ใช้ current template ที่ resolve ได้ หากไม่มี current template ให้ใช้โครงกลางนี้เป็น draft:
1. ความเป็นมา
2. วัตถุประสงค์
3. Scope / specification
4. Deliverables
5. Timeline / delivery
6. Acceptance criteria
7. Budget facts / payment basis ที่ source รองรับ
8. Dependencies / owner-provided inputs
9. Required qualifications/rules เฉพาะที่มี source
10. Attachments / references

`templates/tor-16-sections-template.md` ใช้เป็น working template ได้ แต่ current official structure ต้องยืนยันกับ AFP

### 4. Make requirements testable
ทุก deliverable สำคัญควรเชื่อม:

`Need → Requirement → Evidence/Test → Acceptance condition`

ห้ามสร้างจำนวน ขนาด spec รอบแก้ไข SLA benchmark หรือ threshold เอง

### 5. Neutrality & competition review
ชี้ requirement ที่อาจล็อก brand/model/vendor หรือจำกัดการแข่งขันโดยไม่มี evidence/necessity ที่แสดงใน source แล้วส่งให้ owner/AFP ยืนยัน

### 6. Traceability
| Objective | Requirement/Activity | Deliverable | Acceptance | Source |
|---|---|---|---|---|

### 7. Source gaps
แยกท้ายร่าง:
- Current rules resolved
- Pending AFP confirmation
- Missing source
- Planning assumptions

## Output Contract

ส่งอย่างน้อย:
1. TOR draft พร้อมสถานะ `ร่างเพื่อพิจารณา`
2. Fact/source table
3. Traceability matrix
4. Missing information / source gaps
5. Questions for AFP / project owner

ห้ามเขียนว่า `พร้อมประกาศ`, `ถูกต้องตามกฎหมาย`, `AFP อนุมัติแล้ว` หากไม่มีหลักฐานจริง

## Handoff

- ตรวจร่าง → `tor-review`
- แตกแผน/Gantt → `tor-to-project-plan`
- vendor selection / scoring → Human procurement authority
- legal interpretation → Human legal authority

## Privacy & Authority

ลด PII ในเอกสารแนบตาม Privacy Gate และไม่เก็บ raw personal/vendor data ที่ไม่จำเป็นใน Run State

AI ไม่อนุมัติงบ วิธีจัดซื้อ ผู้ชนะ exception หรือ official signing
