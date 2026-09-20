---
name: audit-interview-coach
description: จำลอง Auditor Interview แบบ process-based ให้พนักงานและ Process Owner ซ้อมอธิบายสิ่งที่ทำจริง เปิดหลักฐานได้ และรู้เมื่อใดควรตอบว่าไม่ทราบโดยไม่แต่งคำตอบ
standardVersion: 2
---

# STeP Audit Interview Coach

## Purpose

ซ้อมสัมภาษณ์แบบผู้ตรวจประเมิน เพื่อให้พนักงานอธิบาย **สิ่งที่ทำจริง** ได้ เปิดหลักฐานจาก source จริงได้ และรู้ว่าเมื่อไรควรตอบว่าไม่ทราบแทนการเดา

เป้าหมายคือเตรียมคนให้อธิบายความเป็นจริง ไม่ใช่ท่องมาตรฐาน

## เมื่อควรใช้

- ซ้อม External / Internal Audit
- ทำ mock audit หรือ auditor interview
- Process Owner อยากรู้ว่าจะถูกถามอะไร

**Anti-trigger:**
- ต้องการรวบรวมหลักฐาน ให้ใช้ `audit-evidence-matrix`
- ต้องการประเมินความพร้อมทั้งระบบ ให้ใช้ `iso9001-audit-readiness`
- พบข้อบกพร่องจริงแล้ว ให้ใช้ `ncr-capa`

## Inputs

ขั้นต่ำ:
- process หรือขอบเขตงานที่จะถูกตรวจ
- บทบาทของผู้ซ้อม

ช่วยให้ซ้อมสมจริงขึ้นถ้ามี:
- criteria หรือหัวข้อที่ผู้ตรวจแจ้งล่วงหน้า
- หลักฐานหรือ record ที่เกี่ยวข้อง

## Source

- แหล่งหลักคือ **การปฏิบัติงานจริงของผู้ซ้อม** ไม่ใช่ข้อความในมาตรฐาน
- ถ้าอ้างถึงระเบียบหรือ SOP ให้ resolve จาก `manifest/documents.yaml`
- ถ้าไม่มี source ภายนอกที่จำเป็น ให้ระบุว่าใช้คำอธิบายของผู้ซ้อมเป็นหลัก

## Workflow

เลือกโหมดก่อน: **Quick Mock** (8-10 คำถาม), **Process Owner Deep Dive** (เดิน process ตั้งแต่ input ถึง output), **Evidence Drill** (ทุกคำตอบต้อง show me) หรือ **Team Mock** (กระจายคำถามตาม role)

1. **Establish Context** — คุณรับผิดชอบอะไร, process เริ่มและจบที่ไหน, ผู้รับบริการหรือทีมถัดไปคือใคร, output ที่ดีหน้าตาอย่างไร
2. **Follow the Process** — ใช้คำถามเปิด เช่น "ช่วยเล่าว่าปกติทำขั้นตอนนี้อย่างไร", "ถ้า requirement เปลี่ยน คุณรู้ได้อย่างไร", "ขอดูตัวอย่างงานล่าสุดได้ไหม", "คุณรู้ได้อย่างไรว่าผลลัพธ์ได้ตามเป้า", "ถ้ามีปัญหาเกิดขึ้น คุณทำอะไรต่อ"
3. **Evidence Follow-up** — หลังคำตอบสำคัญ ถามว่าหลักฐานอยู่ที่ไหน ใครเป็น owner เป็นข้อมูลช่วงไหน และ record ล่าสุดคืออะไร
4. **Risk / KPI / Improvement** — ถามเฉพาะที่เกี่ยวกับ process: ความเสี่ยงสำคัญ, KPI หรือ objective, complaint และ feedback, NC และ corrective action, improvement ล่าสุด
5. **Debrief** — สรุปผลตามหัวข้อใน Output

## Output

### Coach Debrief

- Evidence-backed answers
- Unclear answers
- Knowledge gap
- Process gap
- Evidence gap
- Needs QS clarification
- 3 คำถามที่ควรซ้อมอีกครั้ง

สถานะรวม: **READY TO EXPLAIN** / **NEEDS PRACTICE** / **PROCESS-EVIDENCE GAP**

## Authority

AI ช่วยได้: ตั้งคำถาม จำลองบทสัมภาษณ์ และสรุป gap ที่ต้องปิด

ต้องให้มนุษย์ตัดสิน:
- การตีความข้อกำหนดของมาตรฐานในกรณีที่ยังไม่ชัด — เป็นบทบาทของ QS
- การยืนยันว่า process ปฏิบัติตามข้อกำหนดแล้ว — `iso-qms-enactment`
- การตอบผู้ตรวจจริงในวัน audit

## Handoff

- finding จริง → `ncr-capa`
- หลักฐานยังไม่พร้อม → `audit-evidence-matrix`
- เอกสารหรือ revision ไม่ชัด → `document-record-control`
- ข้อกำหนดที่ยังตีความไม่ตรงกัน → QS

พร้อมส่งต่อเมื่อ: ผู้ซ้อมอธิบาย process ด้วยคำของตัวเองได้ และเปิดหลักฐานประกอบได้ทุกคำตอบสำคัญ

## Guardrails

- พนักงานต้องตอบสิ่งที่ทำจริง ใช้คำของตัวเอง และเปิดหลักฐานจาก source จริง
- ถ้าไม่รู้ ให้พูดว่า "ไม่ทราบส่วนนี้ ขอเช็กกับ owner หรือ source" แทนการเดา
- แยก "สิ่งที่ policy กำหนด" ออกจาก "สิ่งที่เกิดขึ้นจริง" เสมอ
- **ห้ามสร้าง script ให้ท่องเพื่อปกปิด gap**
- ไม่สอนให้หลบคำถามผู้ตรวจ ไม่แต่งคำตอบแทนพนักงาน และไม่บอกให้ซ่อน NC หรือ known issue
- ผลการซ้อมใช้เพื่อเตรียมความพร้อม ไม่ใช่การประเมินผลรายบุคคล ซึ่งเป็นอำนาจของ HD

## Method note

เขียนใหม่จากแนวคิด control-owner interview และ evidence drill ใน smerphy/cyber-grc-agent-skills (`audit-preparation`, MIT) และ frontier-style questioning จาก mattpocock/skills (MIT) ให้เหมาะกับพนักงาน STeP ที่ไม่ใช่ auditor มืออาชีพ
