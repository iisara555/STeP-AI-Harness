---
name: qms-risk-opportunity-review
description: ทบทวน Risks และ Opportunities ของ QMS/Process แบบ evidence-based เชื่อม event/cause/consequence, current controls, action, owner, indicator และผลหลังดำเนินการ โดยไม่แทนที่ Project Risk
---

# STeP QMS Risk & Opportunity Review

> **A control gap is not the risk. Describe what could happen and why it matters.**

## ใช้เมื่อ
- QMS risk / ISO risk
- risk & opportunity
- risk register ของ process
- ทบทวนความเสี่ยงก่อน audit/management review
- โอกาสปรับปรุงจาก customer/process data

## ไม่ใช้แทน
- ความเสี่ยงโครงการเฉพาะงาน → `project-pre-mortem`
- ความเสี่ยงด้านข้อมูลส่วนบุคคล → `data-privacy-compliance`

## Inputs
- Process / objective
- Context / interested parties ที่เกี่ยวข้อง
- existing risk methodology / matrix ถ้ามี
- current controls
- incident/complaint/audit/KPI history
- owner / review cadence

ถ้าองค์กรมี risk scale อยู่แล้ว ต้องใช้ scale นั้น ห้าม invent scale ใหม่เป็น official

## Risk Statement

เขียน:
> Risk that **[event]** due to **[cause/driver]** resulting in **[consequence]**

ตัวอย่าง:
> Risk that service requests exceed agreed response time due to incomplete intake information, resulting in customer delay and repeated rework.

ห้ามเขียนเพียง:
> “ไม่มี SOP”
เพราะนั่นคือ control gap ไม่ใช่ risk event

## Opportunity Statement

เขียน:
> Opportunity to **[improve outcome]** by **[change/action]**, evidenced by **[signal/data]**

Opportunity ต้องมี evidence/signal ไม่ใช่ wishlist

## Review Fields
- Risk / opportunity ID
- Process
- Statement
- Evidence / signal
- Current control
- Control effectiveness evidence
- Existing rating (ถ้ามี)
- Action / treatment
- Owner
- Due date
- Early indicator
- Review result
- Residual status

## Working Status
- CONTROLLED
- ACTION-NEEDED
- MONITOR
- EVIDENCE-GAP
- ESCALATE

ถ้าไม่มีองค์กรกำหนด rating scale ใช้เพียง working status เหล่านี้ แทนการสร้างคะแนน 1–25 เอง

## Review Logic
1. ยืนยัน process/context
2. แยก risk กับ control gap
3. ตรวจ evidence จาก incident/KPI/feedback/audit
4. ตรวจ current controls ว่าทำจริงหรืออยู่แค่เอกสาร
5. ตรวจ action + owner + due date
6. ตรวจ follow-up evidence
7. ส่ง risk สำคัญที่กระทบ objective เข้า `management-review-prep`

## Guardrails
- ไม่ยอมรับ risk ในนามผู้บริหาร
- ไม่เปลี่ยน risk appetite/tolerance เอง
- ไม่ลด rating เพียงเพราะมีแผน แต่ยังไม่มี evidence ว่า control ทำงาน

## Method note
เขียนใหม่จาก risk statement/context/control-effectiveness discipline ใน smerphy/cyber-grc-agent-skills (`risk-assessment`, MIT) และ reuse แนวคิด preventive review จาก STeP `project-pre-mortem`
