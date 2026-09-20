---
name: expert-resource-matching
description: จับคู่โจทย์ที่ผ่านการ frame แล้วกับบริการ STeP, ผู้เชี่ยวชาญ, ห้องปฏิบัติการ, เครื่องมือ หรือโรงงานต้นแบบ โดยใช้ Service Registry และแหล่ง discovery ทางการก่อนให้เจ้าของบริการยืนยัน
standardVersion: 2
---

# STeP Expert & Resource Matching

## Purpose

จับคู่โจทย์ที่ชัดแล้วกับ **ผู้เชี่ยวชาญ นักวิจัย Lab เครื่องมือ Pilot Plant หรือทีมบริการ** ที่เหมาะสม โดยเริ่มจากความสามารถของบริการก่อน แล้วจึงถึงตัวบุคคล

หลักสำคัญ: **Match capability first, person second**

## เมื่อควรใช้

- ผู้ใช้รู้โจทย์ค่อนข้างชัดแล้วและต้องการหาทรัพยากรที่เหมาะสม
- ต้องหา Lab เครื่องมือ หรือโรงงานต้นแบบสำหรับทดสอบ
- ต้องเสนอผู้เชี่ยวชาญให้ผู้ประกอบการหรือหน่วยงานภายนอก

**Anti-trigger:**
- โจทย์ยังเป็นเพียงอาการ เช่น "ของเสียสูง", "อยากใช้ AI", "อยากหาเครื่องมือลดต้นทุน" โดยยังไม่รู้ desired outcome หรือ constraint ให้ใช้ `industry-problem-discovery` ก่อน
- ต้องกรอกหรือส่งแบบฟอร์ม ให้ใช้ `browser-form-assistant`

## Inputs

ขั้นต่ำ:
- Problem หรือ desired outcome
- Domain, material หรือ process ที่เกี่ยวข้อง

ช่วยให้จับคู่แม่นขึ้นถ้ามี:
- Constraints สำคัญ
- ต้องการ Expert, Lab, Equipment, Pilot Plant หรือหลายอย่างรวมกัน
- พื้นที่และช่วงเวลา ถ้ามีผลต่อการใช้ทรัพยากร

## Source

ลำดับการค้น:

1. `manifest/services.yaml` — จับคู่ service/capability และทีมเจ้าของก่อน
2. [ดัชนีเครื่องมือ เครื่องจักร และพื้นที่](../../../docs/facility-equipment-index.md) — ใช้ค้นหา candidate ภายใน FOODFABR, RF Pilot Plant, INFRI, ABPlas และ CIMO; Central Lab ในเอกสารเดิมหมายถึง INFRI ส่วน FABLAB ไม่มีบริการแล้ว เมื่อต้องใช้สเปกให้เปิด PDF ต้นฉบับตามเลขหน้า และ route CIMO/INFRI/RF ไปทีม LES ส่วน Innovative Food Fabrication Pilot Plant ไปทีม FOODFABR
3. STeP และ NSP public service sources ที่ลงทะเบียนใน Service Registry
4. NSTIS เมื่อจำเป็นต้องค้นหานักวิจัย เครื่องมือ Lab หรือโรงงานต้นแบบนอก registry ภายใน
5. Human verification จากเจ้าของบริการก่อนติดต่อ จอง ใช้งบ หรือรับปาก

**ข้อมูลจากเว็บและ NSTIS เป็น discovery evidence ไม่ใช่การยืนยัน availability ราคา SLA หรือความเหมาะสมขั้นสุดท้าย**

## Workflow

1. **Match Service Capability** — อ่าน capability ใน `manifest/services.yaml` แล้วเลือกบริการที่ใกล้โจทย์ที่สุด 1-3 รายการ
2. **Define Matching Criteria** — แยกเป็น Expertise, Method/technology, Equipment/lab capability, Sample/material constraints, Scale (lab / prototype / pilot / commercial) และ Required evidence หรือ certification
3. **Resolve Resources** — ค้นจาก Service Registry และดัชนีเครื่องมือก่อน ถ้าต้องตรวจสเปกให้เปิดหน้าต้นฉบับที่ดัชนีชี้ แล้วจึงใช้ NSP หรือ NSTIS เมื่อข้อมูลไม่พอ **ห้ามสรุปว่าบุคคลนี้เหมาะที่สุดจากตำแหน่งงาน ข่าว หรือ social media เพียงอย่างเดียว**
4. **Evidence & Freshness** — ทุก candidate ต้องมี Source, วันที่ตรวจ, เหตุผลที่ match และสิ่งที่ยังไม่ยืนยัน
5. **Human Verify** — ก่อนส่งต่อจริง ให้เจ้าของบริการหรือผู้ใช้ยืนยัน candidate ปัจจุบัน availability ช่องทางติดต่อ ราคาและเงื่อนไข รวมถึงสิทธิ์ในการใช้ Lab หรือ Equipment

## Output

```markdown
# Expert / Resource Matching

**Problem / outcome:** …
**Service match:** …

| Candidate | Type | Why matched | Source | Verification |
|---|---|---|---|---|
| … | Expert / Lab / Equipment / Pilot Plant | … | … | candidate / owner-confirmed |

## Recommended next step

## Missing information
```

## Authority

AI ช่วยได้: จับคู่ capability เสนอ candidate พร้อมเหตุผล และระบุสิ่งที่ต้องยืนยัน

ต้องให้มนุษย์ตัดสิน:
- การยืนยัน availability ราคา และเงื่อนไขการใช้ทรัพยากร — เป็นอำนาจของเจ้าของบริการ
- การติดต่อ จอง หรือรับปากกับหน่วยงานภายนอก
- การใช้งบประมาณ — `budget-allocation`

## Handoff

- โจทย์ยังไม่ชัด → `industry-problem-discovery`
- ต้องกรอกหรือส่งแบบฟอร์มจอง → `browser-form-assistant` พร้อม Action Gate ตามปกติ
- โจทย์เข้าสู่การวางแผนโครงการ → `project-plan`
- เป็นโอกาสเชิงธุรกิจของงานวิจัย → `startup-discovery`

พร้อมส่งต่อเมื่อ: ทุก candidate มี source และวันที่ตรวจ และระบุชัดว่าข้อใดยัง owner-confirmed ไม่ได้

## Guardrails

- ไม่สร้างฐาน profile บุคคลถาวรจาก Facebook ข่าว หรือ social media
- ไม่เก็บเบอร์โทรหรืออีเมลส่วนบุคคลที่ไม่จำเป็น ตาม `docs/knowledge-policy.md`
- ไม่รับรองคุณสมบัติ ความพร้อม ราคา หรือ SLA จากข้อมูลเก่า
- รายการได้รับการยืนยันจากเจ้าของบริการเมื่อ 2026-09-20 ให้ติดสถานะ `owner-confirmed-reference-2026-09-20`; availability ราคา คิวใช้งาน เงื่อนไข และความปลอดภัยต้องตรวจอีกครั้ง ณ เวลารับบริการ
- กรอง service ที่มีสถานะ `discontinued` ออกจาก candidate; FABLAB เป็นข้อมูลประวัติและห้ามเสนอเป็นบริการปัจจุบัน
- ไม่ติดต่อ จอง หรือส่งข้อมูลออกภายนอกโดยไม่มีสิทธิ์หรือการยืนยันที่เกี่ยวข้อง
