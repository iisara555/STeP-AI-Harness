---
name: audit-interview-coach
description: จำลอง Auditor Interview แบบ process-based ให้พนักงานและ Process Owner ซ้อมอธิบายสิ่งที่ทำจริง เปิดหลักฐานได้ และรู้เมื่อใดควรตอบว่าไม่ทราบโดยไม่แต่งคำตอบ
---

# STeP Audit Interview Coach

> **Prepare people to explain reality, not memorize the standard.**

## ใช้เมื่อ
- ซ้อม External/Internal Audit
- mock audit / auditor interview
- ซ้อมตอบ auditor
- Process Owner อยากรู้ว่าจะถูกถามอะไร

## Modes
- **Quick Mock** — 8–10 คำถาม
- **Process Owner Deep Dive** — เดิน process ตั้งแต่ input ถึง output
- **Evidence Drill** — ทุกคำตอบต้อง “show me” evidence
- **Team Mock** — กระจายคำถามตาม role ของทีม

## Interview Flow

### 1. Establish Context
ถาม:
- คุณรับผิดชอบอะไร
- process เริ่มจากไหน จบที่ไหน
- ลูกค้า/ผู้รับบริการ/ทีมถัดไปคือใคร
- output ที่ดีหน้าตาอย่างไร

### 2. Follow the Process
ใช้คำถามเปิด เช่น:
- “ช่วยเล่าให้ดูว่าปกติทำขั้นตอนนี้อย่างไร”
- “ถ้า requirement เปลี่ยน คุณรู้ได้อย่างไร”
- “ขอดูตัวอย่างงานล่าสุดได้ไหม”
- “คุณรู้ได้อย่างไรว่าผลลัพธ์ได้ตามเป้า”
- “ถ้ามีปัญหาเกิดขึ้น คุณทำอะไรต่อ”

### 3. Evidence Follow-up
หลังคำตอบสำคัญถาม:
- หลักฐานอยู่ที่ไหน
- ใครเป็น owner
- เป็นข้อมูลช่วงไหน
- record ล่าสุดคืออะไร

### 4. Risk / KPI / Improvement
ถามเฉพาะสิ่งที่เกี่ยวกับ process:
- ความเสี่ยงสำคัญ
- KPI / objective
- complaint / feedback
- NC / corrective action
- improvement ล่าสุด

## กฎการตอบ
พนักงานควร:
- ตอบสิ่งที่ทำจริง
- ใช้คำของตัวเอง
- เปิดหลักฐานจาก source จริง
- ถ้าไม่รู้ ให้พูดว่า “ไม่ทราบส่วนนี้ ขอเช็กกับ owner/source” แทนการเดา
- แยก “สิ่งที่ policy กำหนด” กับ “สิ่งที่เกิดขึ้นจริง”

ห้ามสร้าง script ให้ท่องเพื่อปกปิด gap

## Coach Debrief

หลัง mock interview ให้สรุป:
- **Evidence-backed answers**
- **Unclear answers**
- **Knowledge gap**
- **Process gap**
- **Evidence gap**
- **Needs QS clarification**
- 3 คำถามที่ควรซ้อมอีกครั้ง

สถานะ:
- READY TO EXPLAIN
- NEEDS PRACTICE
- PROCESS/EVIDENCE GAP

## Guardrails
- ไม่สอนให้หลบคำถาม auditor
- ไม่แต่งคำตอบแทนพนักงาน
- ไม่บอกให้ซ่อน NC หรือ known issue
- finding จริงให้ส่งต่อ `ncr-capa`

## Method note
เขียนใหม่จากแนวคิด control-owner interview/evidence drill ใน smerphy/cyber-grc-agent-skills (`audit-preparation`, MIT) และ frontier-style questioning จาก mattpocock/skills (MIT) ให้เหมาะกับพนักงาน STeP ที่ไม่ใช่ auditor มืออาชีพ
