---
name: management-review-prep
description: เตรียม Management Review แบบ evidence-based โดยรวบรวม performance, objectives, customer feedback, audit results, NC/CAPA, risks/opportunities, resources, prior actions และ decisions ที่ผู้บริหารต้องพิจารณา
---

# STeP Management Review Preparation

> **Management Review is a decision meeting, not a slide-making exercise.**

## ใช้เมื่อ
- management review / ทบทวนฝ่ายบริหาร
- QMR meeting
- เตรียมข้อมูล ISO ก่อนประชุมผู้บริหาร
- รวม input จาก 22 ทีม
- ตรวจ action จาก management review รอบก่อน

## Role
Skill นี้ **aggregate + check completeness + prepare decisions**
ไม่ตัดสินใจแทนผู้บริหาร และไม่แก้ source record ของแต่ละทีม

## Input Collection

รวบรวมจาก source จริงตาม scope/criteria ขององค์กร เช่น:
- Action จาก Management Review รอบก่อน
- การเปลี่ยนแปลง context / interested parties ที่มีผลกับ QMS
- Quality objectives / KPI และ trend
- Process / service performance
- Customer feedback / complaints / satisfaction
- Audit results และ open findings
- NC / CAPA / effectiveness status
- External provider / supplier issues ที่เกี่ยวข้อง
- Resource / competence / infrastructure issues
- Risks & opportunities
- Improvement opportunities
- Change proposals ที่ต้องการ decision

ถ้า criteria edition กำหนด input เพิ่ม ให้ใช้ audit/QMS source ที่ QS ยืนยันแล้ว ไม่ hardcode จากความจำ

## Preparation Flow

### 1. Source Completeness
ทำ input register:
| Input | Source | Owner | Period | Status | Gap |
|---|---|---|---|---|---|

### 2. Trend & Exception
ไม่ dump ตัวเลขทั้งหมด ให้เน้น:
- target vs actual
- trend
- recurring issue
- overdue action
- open high-impact gap
- evidence confidence

### 3. Decision Queue
ทุกเรื่องที่ต้องผู้บริหารตัดสิน ระบุ:
- Decision needed
- Context/evidence
- Options
- Risk/trade-off
- Recommended owner
- Decision deadline

ใช้ `decision-memo` ถ้าต้องวิเคราะห์ทางเลือกเชิงลึก

### 4. Pre-read
สร้าง pre-read ที่สั้น:
- Executive summary
- What changed
- KPI/quality objective exceptions
- Customer/audit/CAPA highlights
- Risk/opportunity highlights
- Decisions required
- Actions overdue
- Evidence gaps

### 5. Meeting Record
หลังประชุมใช้ `meeting-summary` เพื่อเก็บ:
- decision
- action
- owner
- due date
- follow-up evidence

## Status
- READY-FOR-REVIEW
- PARTIAL-INPUTS
- DECISION-GAP
- EVIDENCE-GAP

## Output

### Management Review Pack
1. Input completeness
2. Quality objective/KPI trends
3. Customer/service signals
4. Audit + NC/CAPA status
5. Risks/opportunities
6. Resource/competence issues
7. Prior action follow-up
8. Decisions required
9. Proposed actions / owners
10. Missing evidence before meeting

## Guardrails
- ห้าม invent management decision
- ห้าม mark action CLOSED โดยไม่มี evidence
- ห้ามเปลี่ยน source KPI/NC/risk record เพื่อให้ report ดูดี
- การอนุมัติ QMS change / SOP / official response ยังเป็น Human Authority

## Method note
เขียนใหม่โดยใช้ aggregation/decision-readiness patterns จาก STeP `executive-status-update`, `decision-memo`, `meeting-summary` และแนวคิด decision-linked metrics จาก smerphy/cyber-grc-agent-skills (MIT)
