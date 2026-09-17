---
name: decision-memo
description: สังเคราะห์ข้อมูลหลายด้านเป็น Decision Memo สำหรับผู้บริหารหรือเจ้าของเรื่อง โดยแยกข้อเท็จจริง ทางเลือก Trade-off ความไม่แน่นอน และสิ่งที่ต้องตัดสินใจอย่างชัดเจน
---

# STeP Decision Memo

Skill นี้ช่วย IMO, SIT, PM, PUBSEC และทีมโครงการเปลี่ยนข้อมูลกระจัดกระจายให้เป็น **เอกสารเพื่อการตัดสินใจ** ไม่ใช่รายงานสถานะทั่วไป

> **Decision clarity over information volume.**

## เมื่อควรใช้
- มีหลายทางเลือกและต้องการเห็น trade-off
- ผู้บริหารต้องตัดสินใจจากข้อมูลหลายแหล่ง
- มีข้อมูลเยอะ แต่ยังไม่ชัดว่า “ต้องตัดสินใจอะไร”
- ต้องเตรียม memo ก่อนประชุมหรือก่อนขอความเห็นชอบ

## Decision Gate
ก่อนเขียน memo ต้องระบุให้ได้:
1. **Decision:** ต้องตัดสินใจเรื่องอะไร
2. **Owner:** ใครเป็นผู้มีอำนาจตัดสินใจ
3. **Deadline:** ต้องตัดสินใจเมื่อไร
4. **Constraints:** งบ เวลา กฎ นโยบาย หรือข้อจำกัดหลัก

ถ้าไม่รู้ Decision ให้ถามก่อน ไม่ควรสรุปรายงานยาวแล้วหวังว่าผู้อ่านจะหา decision เอง

## Memo Structure

### 1. Decision Required
หนึ่งประโยค ชัดและตอบได้

### 2. Context
เฉพาะข้อมูลที่เปลี่ยน decision ไม่เล่าประวัติทั้งหมด

### 3. Facts / Assumptions / Unknowns
แยกสามกลุ่มชัดเจน เพื่อไม่ให้ข้อสันนิษฐานดูเหมือนข้อเท็จจริง

### 4. Options
ควรมี 2–4 ทางเลือกที่เป็นไปได้จริง รวม `Do nothing / Defer` เมื่อมีความหมาย

ต่อแต่ละ Option ระบุ:
- Benefit
- Cost / effort
- Risk
- Reversibility
- Dependency
- Evidence

### 5. Trade-offs
อธิบายว่าได้อะไรแลกกับอะไร ห้ามใช้คะแนนรวมแบบไม่มีเหตุผลรองรับ

### 6. Recommendation
AI สามารถเสนอ **working recommendation** พร้อมเหตุผลได้ เมื่อเป็นการวิเคราะห์ ไม่ใช่การอนุมัติแทนผู้มีอำนาจ

หากเป็นเรื่องงบประมาณ จัดซื้อ นโยบาย กฎหมาย หรือการลงนาม ให้เขียนว่า `เสนอเพื่อพิจารณา` และระบุ Human Decision Owner

### 7. Decision Record
เว้นพื้นที่สำหรับ:
- Decision made
- Decision owner
- Date
- Conditions / follow-up

## Output เริ่มต้น

# Decision Memo — <หัวข้อ>

**Decision required:** …  
**Decision owner:** …  
**Decision by:** …

## Why now
…

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
…

## Working recommendation
…

## Human decision / approval required
…

## Next action after decision
…

## Guardrails
- ห้ามแต่งตัวเลขเพื่อทำให้ recommendation ดูน่าเชื่อถือ
- หาก evidence ขัดกัน ให้แสดง disagreement ไม่เฉลี่ยกลบ
- ระบุ uncertainty ที่อาจเปลี่ยน decision
- ไม่อนุมัติงบ ไม่เลือก vendor ไม่วินิจฉัยกฎหมาย และไม่ลงนามแทนมนุษย์
- หากเป็นเพียงรายงานความคืบหน้า ใช้ `executive-status-update`
- หาก decision ได้แล้วและต้องแตกแผนดำเนินงาน ใช้ `project-plan`

---

**Method note:** ใช้หลัก option/trade-off/decision record ที่พบใน workflow การวางแผนและการตัดสินใจของ agent skill ecosystem แล้วเขียนใหม่ให้สอดคล้องกับ STeP Human Authority Matrix
