---
name: expert-resource-matching
description: จับคู่โจทย์ที่ผ่านการ frame แล้วกับบริการ STeP, ผู้เชี่ยวชาญ, ห้องปฏิบัติการ, เครื่องมือ หรือโรงงานต้นแบบ โดยใช้ Service Registry และแหล่ง discovery ทางการก่อนให้เจ้าของบริการยืนยัน
---

# STeP Expert & Resource Matching

ใช้เมื่อผู้ใช้รู้โจทย์ค่อนข้างชัดแล้วและต้องการหา **ผู้เชี่ยวชาญ / นักวิจัย / Lab / เครื่องมือ / Pilot Plant / ทีมบริการ** ที่เหมาะสม

> Match capability first, person second.

## Source Order

1. `manifest/services.yaml` — จับคู่ service/capability และทีมเจ้าของก่อน
2. STeP / NSP public service sources ที่ลงทะเบียนใน Service Registry
3. NSTIS เมื่อจำเป็นต้องค้นหานักวิจัย เครื่องมือ Lab หรือโรงงานต้นแบบนอก registry ภายใน
4. Human verification จากเจ้าของบริการก่อนติดต่อ จอง ใช้งบ หรือรับปาก

ข้อมูลจากเว็บ/NSTIS เป็น **discovery evidence** ไม่ใช่การยืนยัน availability, ราคา, SLA หรือความเหมาะสมขั้นสุดท้าย

## ก่อน Matching

ถ้าโจทย์ยังเป็นเพียงอาการ เช่น “ของเสียสูง”, “อยากใช้ AI”, “อยากหาเครื่องมือลดต้นทุน” โดยยังไม่รู้ desired outcome/constraint ให้ใช้ `industry-problem-discovery` ก่อน

ขั้นต่ำที่ควรมี:
- Problem / desired outcome
- Domain / material / process
- Constraints สำคัญ
- ต้องการ Expert, Lab, Equipment, Pilot Plant หรือหลายอย่าง
- พื้นที่/ช่วงเวลา ถ้ามีผลต่อการใช้ทรัพยากร

## Workflow

### 1. Match Service Capability
อ่าน capability ใน `manifest/services.yaml` และเลือกบริการที่ใกล้โจทย์ที่สุด 1–3 รายการ

### 2. Define Matching Criteria
แยกสิ่งที่ต้องการเป็น:
- Expertise
- Method / technology
- Equipment / lab capability
- Sample / material constraints
- Scale: lab / prototype / pilot / commercial
- Required evidence or certification

### 3. Resolve Resources
ค้นจาก Service Registry ก่อน หากไม่พอจึงใช้ NSP/NSTIS

ห้ามสรุปว่า “บุคคลนี้เหมาะที่สุด” จากตำแหน่งงาน ข่าว หรือ social media เพียงอย่างเดียว

### 4. Evidence & Freshness
ทุก candidate ต้องมี:
- Source
- วันที่ตรวจ
- เหตุผลที่ match
- สิ่งที่ยังไม่ยืนยัน

### 5. Human Verify
ก่อนส่งต่อจริง ให้เจ้าของบริการหรือผู้ใช้ยืนยัน:
- candidate ปัจจุบัน
- availability
- ช่องทางติดต่อ
- ราคา/เงื่อนไข
- สิทธิ์ในการใช้ Lab/Equipment

## Output

# Expert / Resource Matching

**Problem / outcome:** …
**Service match:** …

| Candidate | Type | Why matched | Source | Verification |
|---|---|---|---|---|
| … | Expert / Lab / Equipment / Pilot Plant | … | … | candidate / owner-confirmed |

## Recommended next step
1. …
2. …

## Missing information
- …

## Guardrails

- ไม่สร้างฐาน profile บุคคลถาวรจาก Facebook, ข่าว หรือ social media
- ไม่เก็บเบอร์โทร/อีเมลส่วนบุคคลที่ไม่จำเป็น
- ไม่รับรองคุณสมบัติ ความพร้อม ราคา หรือ SLA จากข้อมูลเก่า
- ไม่ติดต่อ/จอง/ส่งข้อมูลภายนอกโดยไม่มีสิทธิ์หรือ confirmation ที่เกี่ยวข้อง
- ถ้าต้องกรอกหรือส่งแบบฟอร์ม ให้ส่งต่อ `browser-form-assistant` และใช้ Action Gate ตามปกติ
