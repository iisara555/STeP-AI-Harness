---
name: tor-review
description: ใช้เมื่อต้องตรวจ TOR/ขอบเขตงานก่อนส่ง AFP โดยเน้นความครบถ้วน ความสอดคล้อง ผลส่งมอบ เกณฑ์ตรวจรับ ความเป็นกลาง และ source-backed compliance; ไม่ใช้เพื่อเลือกผู้ชนะ อนุมัติจัดซื้อ หรือให้คำวินิจฉัยกฎหมาย
standardVersion: 2
---

# STeP TOR Review

## Purpose

ทำ **pre-review** ของ TOR เพื่อช่วยเจ้าของเรื่องเตรียมเอกสารให้ตรวจง่ายและลด rework ก่อนส่ง AFP

หลักสำคัญ: **วิธีตรวจอยู่ใน Skill แต่กฎปัจจุบันอยู่ใน Controlled Source**

## เมื่อควรใช้

- ตรวจ TOR หรือขอบเขตงานก่อนส่ง AFP
- ตรวจว่าเกณฑ์ตรวจรับวัดได้จริงหรือไม่
- ตรวจว่าข้อกำหนดเจาะจง brand หรือ vendor โดยไม่มีเหตุผลรองรับหรือไม่

**Anti-trigger:**
- ต้องเขียน TOR ใหม่ ให้ใช้ `tor-government-writing`
- ต้องแตก TOR เป็นแผนงาน ให้ใช้ Playbook `tor-to-project-plan`
- ต้องตัดสินผู้ชนะหรือให้คะแนนซอง เป็น human procurement authority

## Inputs

ขั้นต่ำ:
- ร่าง TOR หรือขอบเขตงานที่จะตรวจ

ช่วยให้ตรวจได้ลึกขึ้นถ้ามี:
- แบบฟอร์มหรือ checklist ปัจจุบันของ AFP
- งบประมาณที่อนุมัติแล้วและเงื่อนไขแหล่งทุน

ก่อนอ่านเอกสารแนบให้ใช้ Privacy Gate และลด PII ที่ไม่จำเป็น

## Source

**Source Gate** — ก่อนสรุปว่าข้อใด "ถูกหรือผิดตามระเบียบ" ให้ตรวจสถานะ Source ใน `manifest/documents.yaml`

- current AFP policy หรือ checklist ที่ `active` และยืนยัน authority แล้ว → ใช้เป็น `ORGANIZATION_RULE`
- ถ้าเป็น `missing`, `provided-unverified` หรือ `pending-*` → ทำได้เฉพาะ structural/risk review และระบุ `NEED-SOURCE`
- **ห้ามนำเลขมาตรา อัตราค่าปรับ หนังสือเวียน เพดานราคา หรือ requirement ที่จำได้จากโมเดลมาใช้เป็น current rule**

กฎหมายและระเบียบสาธารณะใช้เป็น discovery หรือ reference ได้ แต่ต้องแยกจากกฎภายในที่ AFP ยืนยัน

## Workflow

1. **Identify TOR facts** — สกัดจาก TOR โดยตรง: วัตถุประสงค์, scope/activity, deliverables, quantity/specification, dates/duration, budget facts ที่ระบุ, qualification/acceptance criteria, dependencies และ owner-provided inputs สิ่งที่ไม่มีใน TOR ต้องเป็น `missing` หรือ planning assumption ห้ามแต่งเติมเป็น fact
2. **Internal consistency** — ตรวจ วัตถุประสงค์ ↔ scope, scope ↔ deliverable, deliverable ↔ acceptance criteria, จำนวน/หน่วย/วัน/งบที่ขัดกัน และ dependency ที่ทำให้ส่งมอบไม่ได้
3. **Measurable acceptance** — เกณฑ์ตรวจรับต้องตอบได้ว่าตรวจอะไร ด้วยหลักฐานหรือวิธีใด ใครตรวจ และเมื่อไรถือว่าส่งมอบครบ ให้ flag คำอย่าง "คุณภาพดี", "เหมาะสม", "สวยงาม", "มาตรฐานสูง" เมื่อไม่มีเกณฑ์วัด
4. **Neutral specification** — ชี้ข้อกำหนดที่อาจเจาะจง brand/model/vendor โดยไม่เห็นเหตุผลใน source แล้วเสนอให้เจ้าของเรื่องหรือ AFP ตรวจความจำเป็น **ห้ามตัดสิน legality ขั้นสุดท้ายเอง**
5. **Source-backed compliance** — ตรวจเฉพาะกฎที่ resolve source และ revision ได้ เช่น procurement rule, current template/checklist, approved budget memo, current technical standard ทุก finding ที่เป็น rule ต้องอ้าง source และ status ได้
6. **จัดระดับ Severity** — `SOURCE-RULE-ISSUE` (ขัดกับ current verified source), `STRUCTURAL-RISK` (TOR ขัดกัน ตรวจรับไม่ได้ หรือส่งมอบไม่ชัด), `NEED-CLARIFICATION` (ข้อมูลกำกวมหรือขาด), `NEED-SOURCE` (ต้องใช้กฎหรือ revision ที่ยังยืนยันไม่ได้)

## Output

### TOR Review Summary

| Finding | Status | TOR evidence | Source/Rule | Why it matters | Suggested fix |
|---|---|---|---|---|---|

ตามด้วย:
- Missing information
- Source gaps
- Questions for AFP หรือเจ้าของเรื่อง
- Structural readiness: `READY-FOR-AFP-REVIEW` หรือ `NEEDS-REVISION`

**`READY-FOR-AFP-REVIEW` หมายถึงพร้อมให้ AFP ตรวจต่อ ไม่ใช่การอนุมัติจัดซื้อ**

## Authority

AI ช่วยได้: ตรวจโครงสร้าง ความสอดคล้อง เกณฑ์ตรวจรับ และชี้จุดที่ต้องยืนยันกับ source

AI ห้าม:
- เลือกหรือให้คะแนนผู้ยื่นข้อเสนอแทนคณะกรรมการ — `procurement-approval`
- อนุมัติงบหรือจัดซื้อจัดจ้าง — `budget-allocation`
- อนุมัติ exception หรือ waiver — `policy-waiver`
- ให้ legal opinion ที่มีผลผูกพัน — `legal-advice`

## Handoff

- ต้องแตก TOR เป็น WBS หรือ Timeline → Playbook `tor-to-project-plan`
- ต้องเขียน TOR → `tor-government-writing`
- ต้องตัดสินผู้ชนะหรือให้คะแนน → Human procurement authority
- ต้องวินิจฉัยกฎหมาย → Human legal authority
- เอกสารแนบมี PII → `data-privacy-compliance`

พร้อมส่งต่อเมื่อ: ทุก finding มีหลักฐานจาก TOR และระบุสถานะ source ชัดเจน

## Guardrails

- ทุก finding ที่อ้างว่าเป็นกฎ ต้องระบุ source และสถานะของ source นั้นได้
- ไม่สรุปว่า TOR "ถูกระเบียบ" เมื่อ source ยังเป็น missing หรือ unverified ให้ใช้ `NEED-SOURCE` แทน
- ไม่แต่งตัวเลขงบ ระยะเวลา หรือคุณสมบัติที่ไม่ปรากฏใน TOR
- ไม่ตัดสินความชอบด้วยกฎหมายหรือความเป็นกลางขั้นสุดท้าย ให้เสนอเป็นประเด็นให้ AFP ตรวจ
