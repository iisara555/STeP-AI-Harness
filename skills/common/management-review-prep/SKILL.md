---
name: management-review-prep
description: เตรียม Management Review แบบ evidence-based โดยรวบรวม performance, objectives, customer feedback, audit results, NC/CAPA, risks/opportunities, resources, prior actions และ decisions ที่ผู้บริหารต้องพิจารณา
standardVersion: 2
---

# STeP Management Review Preparation

## Purpose

รวบรวมข้อมูลจากทุกทีมให้เป็นชุดข้อมูลที่ผู้บริหารใช้ตัดสินใจได้ ตรวจความครบถ้วนของ input และจัดคิวเรื่องที่ต้องตัดสิน

หลักสำคัญ: **Management Review คือการประชุมเพื่อตัดสินใจ ไม่ใช่การทำสไลด์**

Skill นี้ทำหน้าที่ **aggregate, check completeness และ prepare decisions** ไม่ตัดสินใจแทนผู้บริหาร และไม่แก้ source record ของแต่ละทีม

## เมื่อควรใช้

- เตรียม management review หรือการทบทวนฝ่ายบริหาร
- เตรียม QMR meeting
- รวม input จาก 22 ทีมก่อนประชุม
- ตรวจ action จาก management review รอบก่อน

**Anti-trigger:**
- รายงานสถานะโครงการ ให้ใช้ `executive-status-update`
- ต้องวิเคราะห์ทางเลือกเชิงลึก ให้ใช้ `decision-memo`
- บันทึกผลการประชุม ให้ใช้ `meeting-summary`

## Inputs

รวบรวมจาก source จริงตาม scope และ criteria ขององค์กร:

- Action จาก Management Review รอบก่อน
- การเปลี่ยนแปลง context และ interested parties ที่มีผลกับ QMS
- Quality objectives, KPI และ trend
- Process และ service performance
- Customer feedback, complaints และ satisfaction
- Audit results และ open findings
- NC, CAPA และ effectiveness status
- External provider หรือ supplier issues ที่เกี่ยวข้อง
- Resource, competence และ infrastructure issues
- Risks และ opportunities
- Improvement opportunities
- Change proposals ที่ต้องการ decision

## Source

- ทุก input ต้องมาจาก record จริงของทีมเจ้าของ ไม่ใช่การสรุปซ้ำจากรายงานเก่า
- ถ้า criteria edition กำหนด input เพิ่ม ให้ใช้ audit หรือ QMS source ที่ QS ยืนยันแล้ว **ไม่ hardcode จากความจำ**

## Workflow

1. **Source Completeness** — ทำ input register

   | Input | Source | Owner | Period | Status | Gap |
   |---|---|---|---|---|---|

2. **Trend & Exception** — ไม่ dump ตัวเลขทั้งหมด ให้เน้น target vs actual, trend, recurring issue, overdue action, open high-impact gap และ evidence confidence
3. **Decision Queue** — ทุกเรื่องที่ต้องให้ผู้บริหารตัดสิน ระบุ Decision needed, Context/evidence, Options, Risk/trade-off, Recommended owner และ Decision deadline ใช้ `decision-memo` ถ้าต้องวิเคราะห์ทางเลือกเชิงลึก
4. **Pre-read** — สร้างเอกสารอ่านก่อนประชุมที่สั้น: Executive summary, What changed, KPI exceptions, Customer/audit/CAPA highlights, Risk/opportunity highlights, Decisions required, Actions overdue และ Evidence gaps
5. **Meeting Record** — หลังประชุมใช้ `meeting-summary` เพื่อเก็บ decision, action, owner, due date และ follow-up evidence

**สถานะ:** READY-FOR-REVIEW, PARTIAL-INPUTS, DECISION-GAP, EVIDENCE-GAP

## Output

### Management Review Pack

1. Input completeness
2. Quality objective และ KPI trends
3. Customer และ service signals
4. Audit พร้อม NC/CAPA status
5. Risks และ opportunities
6. Resource และ competence issues
7. Prior action follow-up
8. Decisions required
9. Proposed actions และ owners
10. Missing evidence ก่อนประชุม

## Authority

AI ช่วยได้: รวบรวม input ตรวจความครบถ้วน และจัดคิวการตัดสินใจ

AI ห้าม:
- invent management decision
- mark action `CLOSED` โดยไม่มี evidence
- อนุมัติ QMS change, SOP หรือ official response — เป็น Human Authority ตาม `iso-qms-enactment`

## Handoff

- วิเคราะห์ทางเลือกเชิงลึก → `decision-memo`
- บันทึกผลการประชุม → `meeting-summary`
- KPI ที่ต้องทบทวน → `quality-objective-kpi-review`
- ความเสี่ยง → `qms-risk-opportunity-review`
- NC และ CAPA → `ncr-capa`
- ความพร้อม audit ของแต่ละทีม → `iso9001-audit-readiness`

พร้อมส่งต่อเมื่อ: input register ครบ ทุก decision มี evidence และระบุผู้ตัดสินกับกำหนดเวลาแล้ว

## Guardrails

- ห้ามเปลี่ยน source record ของ KPI, NC หรือ risk เพื่อให้รายงานดูดี
- ห้ามสรุปว่า action ปิดแล้วโดยไม่มีหลักฐาน
- แยกสิ่งที่เป็นข้อมูลออกจากสิ่งที่ต้องตัดสินใจ
- ระบุ input ที่ยังขาดอย่างตรงไปตรงมาก่อนเข้าประชุม

## Method note

เขียนใหม่โดยใช้ aggregation และ decision-readiness patterns จาก `executive-status-update`, `decision-memo` และ `meeting-summary` ของ STeP ร่วมกับแนวคิด decision-linked metrics จาก smerphy/cyber-grc-agent-skills (MIT)
