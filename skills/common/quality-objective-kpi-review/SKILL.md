---
name: quality-objective-kpi-review
description: ทบทวน Quality Objectives และ KPI ให้ measurable, traceable และใช้ตัดสินใจได้ โดยเชื่อม objective, formula, source, baseline, target, cadence, owner, actual, threshold และ action
---

# STeP Quality Objective & KPI Review

> **A metric is useful only if people know what decision follows from it.**

## ใช้เมื่อ
- Quality objective / KPI ISO
- เตรียม KPI ก่อน external audit
- ทบทวนตัวชี้วัดของทีม
- เป้าหมายวัดไม่ได้ / source ไม่ชัด
- เตรียมข้อมูล Management Review

## Review Model

ทุก Objective/KPI ควรตอบได้:

| Field | ต้องรู้ |
|---|---|
| Objective | ต้องการเปลี่ยน outcome อะไร |
| KPI / Metric | วัดอะไร |
| Formula | คำนวณอย่างไร |
| Source | System/record ไหนเป็น source of truth |
| Baseline | จุดเริ่ม |
| Target | เป้าหมายและช่วงเวลา |
| Cadence | วัด/รายงานเมื่อไร |
| Owner | ใครรับผิดชอบติดตาม |
| Actual | ผลล่าสุด |
| Trend | ดีขึ้น/คงที่/แย่ลง |
| Threshold | เมื่อไรต้อง action |
| Response | ใครทำอะไรเมื่อหลุดเป้า |

## Checks

### 1. Outcome vs Output
- “จัดอบรม 5 ครั้ง” = activity/output
- “ผู้เข้าอบรมทำงาน X ได้ตามเกณฑ์ ≥90%” = outcome

Output ใช้ได้ถ้าองค์กรตั้งใจวัด output แต่ต้องไม่แอบอ้างว่าเป็น outcome

### 2. Measurability
- formula reproducible หรือไม่
- numerator/denominator ชัดหรือไม่
- units ชัดหรือไม่
- source มีจริงหรือไม่

### 3. Ownership
Owner ของ metric ต้องรู้:
- data มาจากไหน
- update เมื่อไร
- ถ้าหลุดเป้าจะทำอะไร

### 4. Target & Baseline
เป้าหมายที่ไม่มี baseline ให้สถานะ PARTIAL จนกว่าจะมีเหตุผลรองรับ

### 5. Result → Action
ถ้าผลต่ำกว่า target ต้องมี:
- analysis
- action/decision
- owner
- follow-up

## Status
- **MEASURABLE**
- **PARTIAL**
- **UNMEASURABLE**
- **SOURCE-GAP**
- **ACTION-GAP**

## Output

### Quality Objective Review
| Objective | KPI | Formula/Source | Baseline | Target | Actual | Owner | Status | Action |
|---|---|---|---|---|---|---|---|---|

ตามด้วย:
- Metrics to keep
- Metrics to rewrite
- Missing source/baseline
- KPI below target without action
- Inputs for Management Review

## Guardrails
- ไม่กำหนด KPI รายบุคคลเพื่อใช้ประเมิน HR
- ไม่ invent baseline/target/actual
- ไม่เปลี่ยน approved target เอง
- ถ้าเป็น individual performance ให้ส่งต่อ Human HR authority
- OKR เชิงยุทธศาสตร์ใช้ร่วมกับ `innovation-okr-mapping`

## Method note
เขียนใหม่โดยอาศัยแนวคิด measurability/ownership/alignment จาก tomzx/agents (`review-goals`, MIT), decision-linked metrics จาก smerphy/cyber-grc-agent-skills (`grc-metrics-reporting`, MIT) และ STeP `innovation-okr-mapping`
