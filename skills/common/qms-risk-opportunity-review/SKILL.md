---
name: qms-risk-opportunity-review
description: ทบทวน Risks และ Opportunities ของ QMS/Process แบบ evidence-based เชื่อม event/cause/consequence, current controls, action, owner, indicator และผลหลังดำเนินการ โดยไม่แทนที่ Project Risk
standardVersion: 2
---

# STeP QMS Risk & Opportunity Review

## Purpose

ทบทวนความเสี่ยงและโอกาสของกระบวนการแบบมีหลักฐาน โดยเชื่อมเหตุการณ์ สาเหตุ ผลกระทบ การควบคุมปัจจุบัน การดำเนินการ เจ้าของ และตัวชี้วัด

หลักสำคัญ: **ช่องว่างของการควบคุมไม่ใช่ความเสี่ยง** ต้องอธิบายว่าอะไรอาจเกิดขึ้นและทำไมจึงสำคัญ

## เมื่อควรใช้

- ทบทวน QMS risk หรือ ISO risk
- จัดทำหรือทบทวน risk register ของ process
- ทบทวนความเสี่ยงก่อน audit หรือ management review
- พบโอกาสปรับปรุงจากข้อมูลลูกค้าหรือ process

**Anti-trigger:**
- ความเสี่ยงโครงการเฉพาะงาน → `project-pre-mortem`
- ความเสี่ยงด้านข้อมูลส่วนบุคคล → `data-privacy-compliance`

## Inputs

- Process และ objective
- Context และ interested parties ที่เกี่ยวข้อง
- existing risk methodology หรือ matrix ถ้ามี
- current controls
- ประวัติ incident, complaint, audit และ KPI
- owner และ review cadence

**ถ้าองค์กรมี risk scale อยู่แล้ว ต้องใช้ scale นั้น ห้าม invent scale ใหม่เป็น official**

## Source

- ข้อมูลความเสี่ยงต้องอ้างจาก incident, KPI, feedback หรือ audit จริง
- risk methodology และ scale ขององค์กรต้อง resolve จาก controlled source ใน `manifest/documents.yaml`
- ถ้าไม่มี scale ที่องค์กรกำหนด ให้ใช้ working status แทนการสร้างคะแนน 1-25 เอง

## Workflow

**Risk Statement** — เขียนว่า `Risk that [event] due to [cause/driver] resulting in [consequence]`

ตัวอย่าง: Risk that service requests exceed agreed response time due to incomplete intake information, resulting in customer delay and repeated rework

**ห้ามเขียนเพียง "ไม่มี SOP" เพราะนั่นคือ control gap ไม่ใช่ risk event**

**Opportunity Statement** — เขียนว่า `Opportunity to [improve outcome] by [change/action], evidenced by [signal/data]` โดย opportunity ต้องมี evidence หรือ signal ไม่ใช่ wishlist

1. ยืนยัน process และ context
2. แยก risk ออกจาก control gap
3. ตรวจ evidence จาก incident, KPI, feedback และ audit
4. ตรวจ current controls ว่าทำจริงหรืออยู่แค่เอกสาร
5. ตรวจ action, owner และ due date
6. ตรวจ follow-up evidence
7. ส่ง risk สำคัญที่กระทบ objective เข้า `management-review-prep`

**Working Status:** CONTROLLED, ACTION-NEEDED, MONITOR, EVIDENCE-GAP, ESCALATE

## Output

ตารางทบทวนที่มีฟิลด์: Risk หรือ opportunity ID, Process, Statement, Evidence/signal, Current control, Control effectiveness evidence, Existing rating (ถ้ามี), Action/treatment, Owner, Due date, Early indicator, Review result และ Residual status

## Authority

AI ช่วยได้: เขียน risk statement ตรวจหลักฐาน และเสนอ action

AI ห้าม:
- ยอมรับความเสี่ยงในนามผู้บริหาร
- เปลี่ยน risk appetite หรือ tolerance เอง
- ประกาศว่าความเสี่ยงอยู่ในระดับที่ยอมรับได้อย่างเป็นทางการ — เป็นอำนาจของ Process Owner และ QMR

## Handoff

- risk สำคัญที่กระทบ objective → `management-review-prep`
- ความเสี่ยงโครงการ → `project-pre-mortem`
- ความเสี่ยงด้านข้อมูลส่วนบุคคล → `data-privacy-compliance`
- ความเสี่ยงที่กลายเป็นข้อบกพร่องจริง → `ncr-capa`

พร้อมส่งต่อเมื่อ: ทุก risk มี statement ที่ครบ event-cause-consequence และ action มีเจ้าของกับตัวชี้วัด

## Guardrails

- **ไม่ลด rating เพียงเพราะมีแผน แต่ยังไม่มี evidence ว่า control ทำงาน**
- ไม่สร้าง rating scale ใหม่ทับของที่องค์กรใช้อยู่
- แยก control gap ออกจาก risk event เสมอ
- opportunity ต้องมีสัญญาณหรือข้อมูลรองรับ

## Method note

เขียนใหม่จาก risk statement, context และ control-effectiveness discipline ใน smerphy/cyber-grc-agent-skills (`risk-assessment`, MIT) และนำแนวคิด preventive review จาก `project-pre-mortem` ของ STeP มาใช้ร่วม
