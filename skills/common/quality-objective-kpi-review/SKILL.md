---
name: quality-objective-kpi-review
description: ทบทวน Quality Objectives และ KPI ให้ measurable, traceable และใช้ตัดสินใจได้ โดยเชื่อม objective, formula, source, baseline, target, cadence, owner, actual, threshold และ action
standardVersion: 2
---

# STeP Quality Objective & KPI Review

## Purpose

ทบทวนวัตถุประสงค์คุณภาพและ KPI ให้วัดได้จริง ตรวจย้อนกลับได้ และนำไปตัดสินใจได้

หลักสำคัญ: **ตัวชี้วัดมีประโยชน์ก็ต่อเมื่อคนรู้ว่าต้องตัดสินใจอะไรจากตัวเลขนั้น**

## เมื่อควรใช้

- ทบทวน Quality objective หรือ KPI ตาม ISO
- เตรียม KPI ก่อน external audit
- ทบทวนตัวชี้วัดของทีม
- เป้าหมายวัดไม่ได้หรือ source ไม่ชัด
- เตรียมข้อมูลสำหรับ Management Review

**Anti-trigger:**
- OKR เชิงยุทธศาสตร์ ให้ใช้ `innovation-okr-mapping`
- การประเมินผลรายบุคคล เป็นอำนาจ HR ไม่ใช่ Skill นี้
- ติดตามงานประจำสัปดาห์ ให้ใช้ `team-weekly-review`

## Inputs

ขั้นต่ำ:
- Objective หรือ KPI ที่ต้องทบทวน
- process หรือทีมที่เป็นเจ้าของ

ช่วยให้ทบทวนได้ครบขึ้นถ้ามี:
- baseline, target และผลล่าสุด
- ระบบหรือ record ที่เป็น source of truth

## Source

- ค่า actual และ baseline ต้องมาจากระบบหรือ record จริง **ห้าม invent baseline, target หรือ actual**
- target ที่อนุมัติแล้วต้องอ้างจากเอกสารควบคุมใน `manifest/documents.yaml`

## Workflow

ทุก Objective หรือ KPI ต้องตอบได้ครบตามตารางนี้:

| Field | ต้องรู้ |
|---|---|
| Objective | ต้องการเปลี่ยน outcome อะไร |
| KPI / Metric | วัดอะไร |
| Formula | คำนวณอย่างไร |
| Source | ระบบหรือ record ใดเป็น source of truth |
| Baseline | จุดเริ่ม |
| Target | เป้าหมายและช่วงเวลา |
| Cadence | วัดและรายงานเมื่อไร |
| Owner | ใครรับผิดชอบติดตาม |
| Actual | ผลล่าสุด |
| Trend | ดีขึ้น คงที่ หรือแย่ลง |
| Threshold | เมื่อไรต้อง action |
| Response | ใครทำอะไรเมื่อหลุดเป้า |

**การตรวจ 5 ข้อ:**

1. **Outcome vs Output** — "จัดอบรม 5 ครั้ง" คือ output ส่วน "ผู้เข้าอบรมทำงาน X ได้ตามเกณฑ์ 90% ขึ้นไป" คือ outcome ใช้ output ได้ถ้าองค์กรตั้งใจวัด output แต่ต้องไม่แอบอ้างว่าเป็น outcome
2. **Measurability** — formula reproducible หรือไม่ numerator และ denominator ชัดหรือไม่ units ชัดหรือไม่ source มีจริงหรือไม่
3. **Ownership** — owner ต้องรู้ว่า data มาจากไหน update เมื่อไร และถ้าหลุดเป้าจะทำอะไร
4. **Target & Baseline** — เป้าหมายที่ไม่มี baseline ให้สถานะ PARTIAL จนกว่าจะมีเหตุผลรองรับ
5. **Result → Action** — ถ้าผลต่ำกว่า target ต้องมี analysis, action หรือ decision, owner และ follow-up

**สถานะ:** MEASURABLE, PARTIAL, UNMEASURABLE, SOURCE-GAP, ACTION-GAP

## Output

### Quality Objective Review

| Objective | KPI | Formula/Source | Baseline | Target | Actual | Owner | Status | Action |
|---|---|---|---|---|---|---|---|---|

ตามด้วย:
- Metrics to keep
- Metrics to rewrite
- Missing source หรือ baseline
- KPI ที่ต่ำกว่าเป้าแต่ยังไม่มี action
- Inputs สำหรับ Management Review

## Authority

AI ช่วยได้: ทบทวนความสามารถในการวัด ชี้ gap และเสนอวิธีเขียน KPI ใหม่

AI ห้าม:
- เปลี่ยน approved target เอง
- กำหนด KPI รายบุคคลเพื่อใช้ประเมิน HR — `hr-performance-evaluation` เป็น human-only
- ประกาศว่า objective บรรลุแล้วโดยไม่มีหลักฐาน

## Handoff

- individual performance → Human HR authority
- OKR เชิงยุทธศาสตร์ → `innovation-okr-mapping`
- ข้อมูลสำหรับประชุมผู้บริหาร → `management-review-prep`
- KPI ที่หลุดเป้าจนกลายเป็นข้อบกพร่อง → `ncr-capa`

พร้อมส่งต่อเมื่อ: ทุก KPI มี formula, source, owner และเงื่อนไขว่าต้องทำอะไรเมื่อหลุดเป้า

## Guardrails

- ไม่ invent baseline, target หรือ actual
- ไม่เปลี่ยน approved target เอง
- ไม่ใช้ KPI ของ process มาตัดสินผลงานรายบุคคล
- ไม่รายงานว่ามี action แล้วถ้ายังไม่มีเจ้าของและกำหนดเวลา

## Method note

เขียนใหม่โดยอาศัยแนวคิด measurability, ownership และ alignment จาก tomzx/agents (`review-goals`, MIT), decision-linked metrics จาก smerphy/cyber-grc-agent-skills (`grc-metrics-reporting`, MIT) และ `innovation-okr-mapping` ของ STeP
