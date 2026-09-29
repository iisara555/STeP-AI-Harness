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
AFP ยังไม่ได้ส่งนโยบายจัดซื้อจัดจ้างฉบับ STeP ([ลำดับชั้นระเบียบ](../../../docs/afp-regulation-hierarchy.md) บอกได้แค่ว่าเรื่องไหนน่าจะอยู่ใต้ข้อบังคับ มช. ว่าด้วยการพัสดุ) ข้อที่ต้องพึ่งเนื้อความระเบียบจึงยังเป็น `NEED-SOURCE`

## Workflow

1. **Identify TOR facts** — สกัดจาก TOR โดยตรง: วัตถุประสงค์, scope/activity, deliverables, quantity/specification, dates/duration, budget facts ที่ระบุ, qualification/acceptance criteria, dependencies และ owner-provided inputs สิ่งที่ไม่มีใน TOR ต้องเป็น `missing` หรือ planning assumption ห้ามแต่งเติมเป็น fact
2. **Internal consistency** — ตรวจ วัตถุประสงค์ ↔ scope, scope ↔ deliverable, deliverable ↔ acceptance criteria, จำนวน/หน่วย/วัน/งบที่ขัดกัน และ dependency ที่ทำให้ส่งมอบไม่ได้
3. **Measurable acceptance** — เกณฑ์ตรวจรับต้องตอบได้ว่าตรวจอะไร ด้วยหลักฐานหรือวิธีใด ใครตรวจ และเมื่อไรถือว่าส่งมอบครบ ให้ flag คำอย่าง "คุณภาพดี", "เหมาะสม", "สวยงาม", "มาตรฐานสูง" เมื่อไม่มีเกณฑ์วัด
4. **Neutral specification** — ชี้ข้อกำหนดที่อาจเจาะจง brand/model/vendor โดยไม่เห็นเหตุผลใน source แล้วเสนอให้เจ้าของเรื่องหรือ AFP ตรวจความจำเป็น **ห้ามตัดสิน legality ขั้นสุดท้ายเอง**
5. **Source-backed compliance** — ตรวจเฉพาะกฎที่ resolve source และ revision ได้ เช่น procurement rule, current template/checklist, approved budget memo, current technical standard ทุก finding ที่เป็น rule ต้องอ้าง source และ status ได้
6. **ช่องว่างที่ TOR ไม่ได้เขียน** — ข้อ 1–5 ตรวจสิ่งที่เขียนไว้ ขั้นนี้ตรวจสิ่งที่ TOR **เงียบ** ไล่ตามลำดับเดิมทุกครั้ง:
   - ส่งมอบล่าช้า ส่งไม่ครบ หรือส่งแล้วไม่ผ่านเกณฑ์ตรวจรับ → TOR บอกไหมว่าทำอย่างไรต่อ
   - ขอเปลี่ยนรายละเอียดหรือขอขยายเวลาระหว่างสัญญา → ใครตัดสินจากอะไร
   - งานต้องใช้ข้อมูล สถานที่ หรือคนของ STeP → TOR บอกไหมว่า STeP ต้องให้อะไร เมื่อไร
   - ทรัพย์สินทางปัญญา ข้อมูลส่วนบุคคล และไฟล์ต้นฉบับหลังจบงาน → เป็นของใคร
   - ส่วนที่ TOR เขียนว่า "ไม่รวม" แล้ว ไม่นับเป็นช่องว่าง ให้ตรวจเฉพาะรอยต่อระหว่างส่วนที่รวมกับไม่รวม
   ทุกข้อต้องเขียนเป็นสถานการณ์: **"ถ้าผู้รับจ้าง X ระหว่าง Y — TOR ไม่ได้กำหนดว่า Z"** ข้อที่เขียนเป็นสถานการณ์ไม่ได้ ไม่ต้องใส่
   ไม่ใส่ความเห็นเรื่องรสนิยมหรือทิศทางที่ TOR เลือกไว้ชัดแล้ว เช่น "ควรใช้สีอื่น" ไม่ใช่ช่องว่าง
7. **จัดระดับ Severity** — `SOURCE-RULE-ISSUE` (ขัดกับ current verified source), `STRUCTURAL-RISK` (TOR ขัดกัน ตรวจรับไม่ได้ หรือส่งมอบไม่ชัด), `NEED-CLARIFICATION` (ข้อมูลกำกวมหรือขาด), `NEED-SOURCE` (ต้องใช้กฎหรือ revision ที่ยังยืนยันไม่ได้)

8. **ตรวจซ้ำก่อนส่ง** — ก่อนใส่ finding ใด ให้ค้นใน TOR อีกรอบว่าคำตอบอยู่ส่วนอื่นหรือไม่ ถ้ามีแล้วให้ตัดทิ้ง ถ้ามีบางส่วนให้เขียนว่าส่วนไหนครอบคลุมแล้วและถามเฉพาะที่เหลือ คำถามที่ส่งไปแล้วเจ้าของเรื่องชี้ว่า "อยู่หน้า 3" ทำให้ผู้ใช้เสียความน่าเชื่อถือ
9. **Pre-mortem** — นึกว่าหลังเซ็นสัญญา 1 เดือนมีปัญหาเกิดขึ้น 3 เรื่อง เช่น ตรวจรับไม่ได้ ผู้รับจ้างอ้างว่าไม่อยู่ในขอบเขต หรือ STeP ส่งข้อมูลไม่ทัน แล้วตรวจว่า TOR ป้องกันไว้หรือยัง ข้อที่ยังไม่ป้องกันให้กลับไปจัดเข้าขั้น 6

TOR ที่เขียนครบควรได้ `READY-FOR-AFP-REVIEW` จำนวน finding ไม่ใช่ตัววัดว่าตรวจดี finding ที่ไม่มีมูลทำให้ผู้ใช้เลิกเชื่อผลตรวจทั้งหมด

## Output

ตัวอย่างคำตอบที่ดีพร้อมเหตุผล (ข้อมูลสังเคราะห์): [examples/good-output.md](examples/good-output.md) เปิดดูเมื่อไม่แน่ใจรูปแบบ หรือเมื่อข้อมูลต้นทางไม่ครบ

### TOR Review Summary

| Finding | Status | TOR evidence | Source/Rule | Why it matters | Suggested fix |
|---|---|---|---|---|---|

ตามด้วย:
- Missing information
- Source gaps
- **คำถามส่งต่อ** — เรียงตามความรุนแรง เขียนเป็นประโยคสุภาพที่คัดลอกไปส่ง LINE หรืออีเมลถึง AFP หรือเจ้าของเรื่องได้ทันที และอ้างเลข finding
- ช่องว่างจาก pre-mortem ที่ TOR ยังไม่ป้องกัน
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
- ห้ามตรวจ TOR ที่ยังไม่ได้อ่านจริง ถ้าได้แค่ชื่อไฟล์หรือลิงก์ที่เปิดไม่ได้ ให้ขอเนื้อหา
