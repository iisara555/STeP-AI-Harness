---
name: decision-memo
description: สังเคราะห์ข้อมูลหลายด้านเป็น Decision Memo สำหรับผู้บริหารหรือเจ้าของเรื่อง โดยแยกข้อเท็จจริง ทางเลือก Trade-off ความไม่แน่นอน และสิ่งที่ต้องตัดสินใจอย่างชัดเจน
standardVersion: 2
---

# STeP Decision Memo

## Purpose

เปลี่ยนข้อมูลกระจัดกระจายให้เป็น **เอกสารเพื่อการตัดสินใจ** ไม่ใช่รายงานสถานะ ช่วย IMO, SIT, PM, PubSec และทีมโครงการให้ผู้มีอำนาจเห็นว่าต้องตัดสินใจอะไร บนทางเลือกใด และแลกกับอะไร

หลักสำคัญ: **Decision clarity over information volume**

## เมื่อควรใช้

- มีหลายทางเลือกและต้องการเห็น trade-off
- ผู้บริหารต้องตัดสินใจจากข้อมูลหลายแหล่ง
- มีข้อมูลเยอะแต่ยังไม่ชัดว่าต้องตัดสินใจอะไร
- ต้องเตรียม memo ก่อนประชุมหรือก่อนขอความเห็นชอบ

**Anti-trigger:**
- เป็นเพียงรายงานความคืบหน้า ให้ใช้ `executive-status-update`
- ตัดสินใจแล้วและต้องแตกแผนดำเนินงาน ให้ใช้ `project-plan`
- ต้องการท้าทายสมมติฐานก่อนตัดสินใจ ให้ใช้ `assumption-challenger`

## Inputs

**Decision Gate** — ก่อนเขียน memo ต้องระบุให้ได้ 4 ข้อ:

1. **Decision** — ต้องตัดสินใจเรื่องอะไร
2. **Owner** — ใครเป็นผู้มีอำนาจตัดสินใจ
3. **Deadline** — ต้องตัดสินใจเมื่อไร
4. **Constraints** — งบ เวลา กฎ นโยบาย หรือข้อจำกัดหลัก

ถ้าไม่รู้ Decision ให้ถามก่อน อย่าสรุปรายงานยาวแล้วหวังว่าผู้อ่านจะหา decision เอง

## Source

- ข้อมูลที่ใช้ต้องอ้างแหล่งได้ทุกข้อ และแยกชัดว่าเป็น fact, assumption หรือ unknown
- กฎ ระเบียบ และนโยบายต้อง resolve จาก `manifest/documents.yaml`
- ผู้มีอำนาจตัดสินใจอ้างจาก `manifest/authority.yaml` และ `manifest/organization.yaml` → `executiveOversight`

## Workflow

1. **Decision Required** — เขียนหนึ่งประโยคที่ชัดและตอบได้
2. **Context** — เฉพาะข้อมูลที่เปลี่ยน decision ไม่เล่าประวัติทั้งหมด
3. **Facts / Assumptions / Unknowns** — แยกสามกลุ่มให้ชัด เพื่อไม่ให้ข้อสันนิษฐานดูเหมือนข้อเท็จจริง
4. **Options** — 2-4 ทางเลือกที่เป็นไปได้จริง รวม `Do nothing / Defer` เมื่อมีความหมาย แต่ละทางเลือกระบุ Benefit, Cost/effort, Risk, Reversibility, Dependency และ Evidence
5. **Trade-offs** — อธิบายว่าได้อะไรแลกกับอะไร ห้ามใช้คะแนนรวมแบบไม่มีเหตุผลรองรับ
6. **Recommendation** — เสนอ working recommendation พร้อมเหตุผลได้ เพราะเป็นการวิเคราะห์ ไม่ใช่การอนุมัติแทนผู้มีอำนาจ
7. **Decision Record** — เว้นพื้นที่ให้บันทึก Decision made, Decision owner, Date และ Conditions/follow-up

## Output

```markdown
# Decision Memo — <หัวข้อ>

**Decision required:** …
**Decision owner:** …
**Decision by:** …

## Why now

## What we know
- Fact: …
- Assumption: …
- Unknown: …

## Options
### Option A — …
- Upside:
- Downside:
- Risk:
- Reversible?:

## Trade-offs

## Working recommendation

## Human decision / approval required

## Next action after decision
```

## Authority

AI ช่วยได้: สังเคราะห์ข้อมูล จัดทางเลือก วิเคราะห์ trade-off และเสนอ working recommendation พร้อมเหตุผล

ต้องให้มนุษย์ตัดสิน:
- เรื่องงบประมาณ จัดซื้อ นโยบาย กฎหมาย และการลงนาม ให้เขียนว่า `เสนอเพื่อพิจารณา` และระบุ Human Decision Owner เสมอ
- การรับรองว่าข้อมูลในเมโมถูกต้องก่อนเข้าที่ประชุม

## Handoff

- รายงานความคืบหน้า → `executive-status-update`
- decision ได้แล้วและต้องแตกแผน → `project-plan`
- สมมติฐานที่ยังเสี่ยง → `assumption-challenger`
- ความเสี่ยงก่อนลงนามสัญญา → `project-pre-mortem`

พร้อมส่งต่อเมื่อ: Decision, Owner, Deadline และ Constraints ครบ และทุก Option มีหลักฐานกำกับ

## Guardrails

- ห้ามแต่งตัวเลขเพื่อทำให้ recommendation ดูน่าเชื่อถือ
- หาก evidence ขัดกัน ให้แสดง disagreement ไม่เฉลี่ยกลบ
- ระบุ uncertainty ที่อาจเปลี่ยน decision
- ไม่อนุมัติงบ ไม่เลือก vendor ไม่วินิจฉัยกฎหมาย และไม่ลงนามแทนมนุษย์

## Method note

ใช้หลัก option / trade-off / decision record ที่พบใน workflow การวางแผนและการตัดสินใจของ agent skill ecosystem แล้วเขียนใหม่ให้สอดคล้องกับ STeP Human Authority Matrix
