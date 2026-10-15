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
- intended use / ผลสำเร็จที่ต้องการ ข้อจำกัด งานที่ไม่รวม และรูปแบบที่ผู้ใช้ต้องการ เมื่อมี

สิ่งที่ยังไม่รู้ให้ใช้ `รอยืนยัน` พร้อมระบุเจ้าของคำตอบ

### Draft assistance with incomplete inputs

Draft useful prose from the supplied procurement subject and intended use even when the background, objectives or scope fields are blank. Write a proposed rationale, objectives, neutral functional requirements, deliverables and inspection methods for owner review. Do not invent a history of defects or events. Label proposed requirement sections as provisional in the draft and record their assumptions and `AI_PROPOSED` provenance in the separate review. A working-template placeholder is a field guide, not the default output for every missing paragraph.

Keep unknown factual values and authority-dependent conditions pending: amounts, quantities, dimensions, thresholds, agreed dates, approved budgets, legal conditions, qualifications, penalties and warranty periods require supplied evidence. Missing policy sources do not prevent drafting the narrative and functional proposals. Preserve every unrelated section and user edit when revising; an explicit user correction updates the corresponding draft field without implying approval.

## Source

**Source Gate** — ก่อนใช้กฎ แบบฟอร์ม อัตรา วัน ระยะรับประกัน เกณฑ์ผู้ยื่นข้อเสนอ หรือข้อความบังคับ ให้ resolve จาก `../../manifest/documents.yaml` และ source ปัจจุบัน

- `active` และยืนยัน authority แล้ว → ใช้เป็น organization rule ได้
- `missing`, `provided-unverified` หรือ `pending-*` → ใส่ `รอยืนยัน` และห้ามแต่ง rule
- template ใช้เป็นโครงได้ แต่ต้องตรวจ version และ current status

รายละเอียดที่เปลี่ยนได้ เช่น ค่าปรับ เกณฑ์ราคา หนังสือเวียน คุณสมบัติผู้เสนอ และ technical threshold **ต้องอยู่ใน source ไม่ใช่ในความจำของ Skill**

อ่าน [แผนที่แหล่งจัดซื้อจัดจ้าง](references/procurement-source-map.md) เพื่อเทียบสาระและตรวจต้นทาง แยก “อ่านเอกสารแล้ว” จาก “ยืนยันฉบับปัจจุบันและใช้กับงานนี้ได้” ลิงก์หรือชื่อระเบียบเพียงอย่างเดียวไม่ผ่าน Source Gate

## Workflow

ก่อนร่างหรือแก้ อ่าน [วิธีร่างตามงานจริง](references/tor-drafting-guide.md) และ [ตัวอย่างซื้อพัสดุ/จ้างบริการ](examples/task-adaptations.md) ตัวอย่าง AI Computer เป็นงานเฉพาะ ไม่ใช่แม่แบบเนื้อหาของทุก TOR ห้ามยกความเป็นมา สเปก จำนวน คุณสมบัติ SLA หรือเงื่อนไขของตัวอย่างมาเป็นค่าเริ่มต้น

1. **Classify the procurement need** — สรุปผู้ใช้ การใช้งาน ผลสำเร็จ และขอบเขตที่ไม่รวม แยกงานซื้อ งานจ้าง งานผสม/งานเฉพาะตามข้อมูล โดยไม่เดาวิธีจัดซื้อหรือข้อกฎหมายที่ยังไม่ยืนยัน
2. **Build fact table**

   | Topic | Value | Source | Status |
   |---|---|---|---|
   | Objective | … | … | verified / pending |
   | Deliverable | … | … | … |
   | Budget | … | … | … |
   | Date | … | … | … |

3. **Draft structure** — ใช้ current template ที่ resolve ได้ก่อน เทียบสาระกับหัวข้อในแบบและรักษารูปแบบที่ผู้ใช้ต้องการ ถ้าไม่มีให้ใช้โครงกลาง: ความเป็นมา, วัตถุประสงค์, Scope/specification, Deliverables, Timeline/delivery, Acceptance criteria, Budget facts/payment basis ที่ source รองรับ, Dependencies/owner-provided inputs, Required qualifications เฉพาะที่มี source, Attachments/references

   [แม่แบบกลาง ๑๖ หัวข้อ](../thai-official-documents/templates/tor-16-sections-template.md) ใช้เป็น working template ได้ ไม่อ้างว่า 16 หัวข้อเป็นข้อบังคับสากล current official structure ต้องยืนยันกับ AFP ไม่คัดอัตรา คุณสมบัติ SLA หรือข้อกฎหมายที่ยังไม่ resolve จาก source

4. **Make requirements testable** — ทุก deliverable สำคัญเชื่อม `Need → Requirement → Evidence/Test → Acceptance condition` **ห้ามสร้างจำนวน ขนาด spec รอบแก้ไข SLA benchmark หรือ threshold เอง**. Proposed functional requirements and inspection methods may be drafted for owner review; they are not established specifications or procurement rules.
5. **Neutrality & competition review** — ชี้ requirement ที่อาจล็อก brand/model/vendor หรือจำกัดการแข่งขันโดยไม่มี evidence ใน source แล้วส่งให้ owner หรือ AFP ยืนยัน
6. **Traceability** — ตรวจความต้องการทุกข้อและรอยต่อจาก Objective / Requirement-Activity / Deliverable / Acceptance / Source แยกเกณฑ์คัดเลือกผู้เสนอออกจากเกณฑ์ตรวจรับ งานแต่ละรายการมีวิธีตรวจ/หลักฐาน/เงื่อนไขผ่านที่ตรวจซ้ำได้ ค่าที่ขาดเว้นเฉพาะจุด
7. **Source gaps & review** — แยก Current rules resolved, Pending AFP confirmation, Missing source, Planning assumptions และ coverage ไว้ในผลตรวจนอก TOR ตรวจจำนวน หน่วย วันส่งมอบ งวดงาน/เงิน และข้อยกเว้นข้ามหัวข้อ คงเนื้อหาอื่นเมื่อแก้เฉพาะเรื่อง ไม่เพิ่มภาคผนวกผลตรวจเอง

## Output

ส่งอย่างน้อย:

ตัวอย่างวิธีเขียนและเหตุผล (ข้อมูลสังเคราะห์): [ซื้ออุปกรณ์ / จ้างทำคู่มือ / แก้จำนวน](examples/task-adaptations.md) ใช้เรียนวิธีปรับตามงาน ไม่คัดข้อเท็จจริงของตัวอย่าง

1. TOR draft พร้อมสถานะ `ร่างเพื่อพิจารณา`
2. Fact / source table
3. Traceability matrix
4. Missing information และ source gaps
5. Questions for AFP หรือ project owner

รายการ 2–5 แสดงแยกจากตัว TOR ใน `document_review` เมื่อ host รองรับ พร้อมเทียบความต้องการกับตำแหน่งในร่างเป็น `ครอบคลุม / เสนอเพิ่ม / รอยืนยัน / ขัดกัน` ไม่แทรกคำอธิบาย Skill หรือ source checklist ลงเอกสารส่งออก ร่างที่ดีอ่านต่อเนื่อง มีหัวข้อจริงและตารางตรวจรับที่พอดีหน้า ไม่ใช่ทั้งฉบับใน code fence หรือช่องรอยืนยันทุกย่อหน้า

**ห้ามเขียนว่า `พร้อมประกาศ`, `ถูกต้องตามกฎหมาย` หรือ `AFP อนุมัติแล้ว` หากไม่มีหลักฐานจริง**

## Authority

AI ช่วยได้: ยกร่าง จัดโครงสร้าง ทำ traceability และชี้ source gap

AI ไม่อนุมัติ: งบประมาณ วิธีจัดซื้อ ผู้ชนะ exception หรือการลงนาม ตาม `../../manifest/authority.yaml` (`procurement-approval`, `budget-allocation`, `policy-waiver`, `official-signing`)

## Handoff

- ตรวจร่าง → `tor-review`
- แตกแผนหรือ Gantt → Playbook `tor-to-project-plan`
- vendor selection หรือ scoring → Human procurement authority
- legal interpretation → Human legal authority

พร้อมส่งต่อเมื่อ: ทุกข้อกำหนดมี source หรือสถานะ `รอยืนยัน` และเกณฑ์ตรวจรับทดสอบได้

## Guardrails

- ลด PII ในเอกสารแนบตาม Privacy Gate และไม่เก็บ raw personal หรือ vendor data ที่ไม่จำเป็นใน Run State
- ไม่แต่งกฎพัสดุ อัตรา หรือคุณสมบัติผู้เสนอจากความจำ
- Do not assert unsourced specifications or technical thresholds as established requirements. Clearly provisional functional proposals may be drafted for owner confirmation.
- ไม่ระบุสถานะการอนุมัติที่ยังไม่เกิดขึ้นจริง
