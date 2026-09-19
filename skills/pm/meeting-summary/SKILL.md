---
name: meeting-summary
description: ใช้เมื่อมีบันทึกประชุม Transcript หรือ Chat ที่ต้องสรุปเป็นมติ Action Owner Due date และประเด็นค้างโดยยึดต้นทาง; ไม่ใช้เพื่อแต่งมติ กำหนด owner/deadline ที่ไม่ได้ตกลง หรือสร้างแผนโครงการหลายขั้นแทน meeting-to-action-plan
---

# STeP Meeting Summary

## Inputs
- meeting notes / transcript / chat
- วันที่/ชื่อประชุมเมื่อมี
- source reference เพื่อ trace กลับ

## Workflow
1. แยก **Decision / Action / Information / Proposal / Open Issue / Risk**
2. รวมประเด็นซ้ำแต่รักษาความหมายและตัวเลขสำคัญจากต้นทาง
3. ทุก Action ระบุ Owner / Due date / Dependency เฉพาะเมื่อมีหลักฐาน
4. ถ้าไม่ระบุ ให้ใช้ `ยังไม่ระบุ` หรือ `รอยืนยัน` ห้ามคาดเดา
5. แยก Proposal ที่ยังไม่ตกลงออกจาก Decision
6. ระบุ conflict หรือข้อความที่ตีความได้หลายแบบเป็น Open Issue
7. ตรวจ PII ก่อนเก็บ/แชร์ output

## Output Contract
### Summary
- เป้าหมาย/บริบทประชุม
- มติสำคัญ
- ข้อมูลแจ้งให้ทราบ

### Action Table
| Action | Owner | Due date | Dependency | Source | Status |
|---|---|---|---|---|---|

### Open Issues / Risks
- …

### Next Meeting Check
- ประเด็นที่ต้องกลับมาตรวจ

## Handoff
- ถ้าผู้ใช้ต้องการแตก Action เป็น Timeline/Spreadsheet/Gantt → `meeting-to-action-plan`
- ถ้าต้องสร้างหนังสือราชการจากมติ → `thai-official-documents`

## Guardrails
- ไม่แต่งมติ คำสั่ง owner deadline budget หรือ approval
- ไม่เปลี่ยน Proposal เป็น Decision
- ไม่รายงานว่างานถูกส่ง/มอบหมายแล้วหากมีเพียง draft
- การรับรองรายงานประชุมอย่างเป็นทางการเป็น Human Authority
