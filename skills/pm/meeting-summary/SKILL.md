---
name: meeting-summary
description: ใช้เมื่อมีบันทึกประชุม Transcript หรือ Chat ที่ต้องสรุปเป็นมติ Action Owner Due date และประเด็นค้างโดยยึดต้นทาง; ไม่ใช้เพื่อแต่งมติ กำหนด owner/deadline ที่ไม่ได้ตกลง หรือสร้างแผนโครงการหลายขั้นแทน meeting-to-action-plan
standardVersion: 2
---

# STeP Meeting Summary

## Purpose

แปลงบันทึกประชุม transcript หรือ chat ให้เป็นมติ Action ที่มีเจ้าของและกำหนดเวลา พร้อมประเด็นค้าง โดยยึดสิ่งที่ปรากฏในต้นทางเท่านั้น

## เมื่อควรใช้

- มีบันทึกประชุม transcript หรือ chat ที่ต้องสรุป
- ต้องการแยกว่าอะไรคือมติ อะไรคือข้อเสนอที่ยังไม่ตกลง
- ต้องการตารางงานที่ต้องทำต่อพร้อมเจ้าของ

**Anti-trigger:**
- ต้องแตก Action เป็น Timeline, Spreadsheet หรือ Gantt ให้ใช้ Playbook `meeting-to-action-plan`
- ต้องทำหนังสือราชการจากมติ ให้ใช้ `thai-official-documents`
- ต้องการรายงานสถานะโครงการต่อผู้บริหาร ให้ใช้ `executive-status-update`

## Inputs

ขั้นต่ำ:
- meeting notes, transcript หรือ chat

ช่วยให้สรุปแม่นขึ้นถ้ามี:
- วันที่และชื่อการประชุม
- source reference เพื่อ trace กลับ

## Source

- แหล่งเดียวคือ **บันทึกที่ผู้ใช้ให้มา** ไม่เติมข้อมูลจากความจำหรือการประชุมครั้งก่อน
- ถ้ามติอ้างถึงระเบียบหรือเอกสารควบคุม ให้ resolve จาก `manifest/documents.yaml` ก่อนนำมาอ้าง

## Workflow

1. แยก **Decision / Action / Information / Proposal / Open Issue / Risk**
2. รวมประเด็นซ้ำแต่รักษาความหมายและตัวเลขสำคัญจากต้นทาง
3. ทุก Action ระบุ Owner / Due date / Dependency เฉพาะเมื่อมีหลักฐาน
4. ถ้าไม่ระบุ ให้ใช้ `ยังไม่ระบุ` หรือ `รอยืนยัน` ห้ามคาดเดา
5. แยก Proposal ที่ยังไม่ตกลงออกจาก Decision
6. ระบุ conflict หรือข้อความที่ตีความได้หลายแบบเป็น Open Issue
7. ตรวจ PII ก่อนเก็บหรือแชร์ output

## Output

### Summary
- เป้าหมายและบริบทการประชุม
- มติสำคัญ
- ข้อมูลแจ้งให้ทราบ

### Action Table

| Action | Owner | Due date | Dependency | Source | Status |
|---|---|---|---|---|---|

### Open Issues / Risks

### Next Meeting Check
ประเด็นที่ต้องกลับมาตรวจ

## Authority

AI ช่วยได้: สรุป จัดหมวด และชี้ประเด็นที่ยังไม่ชัด

ต้องให้มนุษย์ตัดสิน:
- การรับรองรายงานการประชุมอย่างเป็นทางการ
- การมอบหมายงานและกำหนดเส้นตายที่ยังไม่ได้ตกลงในที่ประชุม
- มติที่เกี่ยวกับงบประมาณ จัดซื้อ หรือการลงนาม ตาม `manifest/authority.yaml`

## Handoff

- แตก Action เป็น Timeline หรือ Spreadsheet → Playbook `meeting-to-action-plan`
- สร้างหนังสือราชการจากมติ → `thai-official-documents`
- มติที่ต้องกลายเป็นแผนโครงการ → `project-plan`
- บันทึกมี PII → `data-privacy-compliance`

พร้อมส่งต่อเมื่อ: ทุก Action มีสถานะชัดว่ามี Owner จริงหรือยัง `รอยืนยัน`

## Guardrails

- ไม่แต่งมติ คำสั่ง owner deadline budget หรือ approval
- ไม่เปลี่ยน Proposal เป็น Decision
- ไม่รายงานว่างานถูกส่งหรือมอบหมายแล้ว หากมีเพียงร่าง
- การรับรองรายงานประชุมอย่างเป็นทางการเป็น Human Authority
