---
name: assumption-challenger
description: ท้าทายและจัดลำดับสมมติฐานของโครงการ ธุรกิจ หรือนวัตกรรมก่อนลงทุนลงมือจริง แยก Fact, Assumption, Decision และออกแบบการทดสอบที่ประหยัดที่สุด
---

# STeP Assumption Challenger

Skill นี้ใช้ก่อนหรือระหว่าง Discovery เพื่อช่วย PITI, ISI, EIC, MI, TECH-SPIN และทีมโครงการ **ค้นหาสิ่งที่กำลังเชื่อโดยยังไม่มีหลักฐาน** แล้วเปลี่ยนสมมติฐานสำคัญให้เป็นคำถามและการทดลองที่ตรวจได้

> **Challenge the assumption, not the person.**

## เมื่อควรใช้
- ไอเดียดูดีแต่ยังไม่รู้ว่าลูกค้าต้องการจริงหรือไม่
- ทีมเริ่มออกแบบ solution ก่อนยืนยัน problem
- มีการใช้คำว่า “น่าจะ”, “คง”, “ทุกคน”, “ตลาดต้องการ”, “ทำได้แน่” โดยไม่มี evidence
- ต้อง stress-test proposal ก่อนเสนอผู้บริหาร/mentor

## Distinguish 4 Things
ทุกประเด็นให้จัดเป็นหนึ่งในนี้:
- **FACT** — มีหลักฐานตรวจสอบแล้ว
- **ASSUMPTION** — เชื่อว่าเป็นจริงแต่ยังต้องพิสูจน์
- **DECISION** — ทางเลือกที่เจ้าของงานต้องตัดสินใจ
- **UNKNOWN** — ยังไม่มีข้อมูลพอแม้จะตั้งสมมติฐาน

ห้ามเปลี่ยน ASSUMPTION เป็น FACT เพียงเพราะดูสมเหตุผล

## Assumption Map
ตรวจอย่างน้อย 6 มิติเมื่อเกี่ยวข้อง:
1. **Problem** — ปัญหาเกิดจริงและสำคัญพอหรือไม่
2. **Customer / User** — ใครมีปัญหานี้และใครตัดสินใจ
3. **Value** — solution สร้างคุณค่าที่ผู้ใช้รับรู้หรือไม่
4. **Behavior / Adoption** — ผู้ใช้จะเปลี่ยนพฤติกรรมหรือไม่
5. **Feasibility** — เทคโนโลยี กระบวนการ บุคลากร และข้อจำกัดทำได้จริงหรือไม่
6. **Viability** — งบ รายได้ ต้นทุน partner / policy dependency สมเหตุผลหรือไม่

## Challenge Loop

### 1. Extract
ดึง statement ที่เป็นสมมติฐานจาก brief / proposal / conversation

### 2. Rank
ให้ระดับโดยไม่สร้าง precision เกินจริง:
- **Critical:** ถ้าผิด แนวทางหลักพัง
- **Important:** ถ้าผิด ต้องปรับแผนมาก
- **Monitor:** ถ้าผิด ยังเดินต่อได้

### 3. Ask the Frontier
ถามเฉพาะคำถามที่คำตอบช่วยปลดล็อกการตัดสินใจ “ตอนนี้” สูงสุด ไม่ถามทุกอย่างพร้อมกัน

ต่อหนึ่งรอบควรไม่เกิน 3–5 คำถาม และหาก AI หา fact จากเอกสาร/แหล่งข้อมูลได้เอง ให้หาเอง ไม่โยนกลับให้ผู้ใช้

### 4. Cheapest Valid Test
สำหรับ Critical Assumption ให้เสนอวิธีทดสอบที่เร็วและถูกที่สุดที่ยังตอบคำถามได้ เช่น:
- Interview
- Landing-page/message test
- Prototype walkthrough
- Desk research
- Technical spike
- Small pilot
- Manual concierge test

### 5. Define Evidence Threshold
ก่อนทดสอบ ให้บอกว่าผลแบบไหนจะ:
- Support
- Weaken
- Invalidate
สมมติฐาน

## Output เริ่มต้น

### Assumption Register
| Assumption | Type | Criticality | Current Evidence | Cheapest Test | Decision After Test |
|---|---|---|---|---|---|

จากนั้นสรุป:
- **Top 3 assumptions to test now**
- **Questions to ask next**
- **What not to build yet**

## Guardrails
- ห้าม “validate” จากความคิดเห็นของคนในทีมเอง
- ห้ามนับคำชมว่าเป็น willingness-to-pay หรือ adoption evidence
- ห้ามคิดแทนผู้ใช้ใน decision ที่มีอำนาจอนุมัติ
- ถ้าเป็น customer discovery จริง ให้ส่งต่อ `startup-discovery` สำหรับ VPC / The Mom Test
- ถ้าเป็น risk ก่อนเริ่มโครงการที่มี scope ชัดแล้ว ให้ใช้ `project-pre-mortem`

---

**Method note:** ปรับแนวคิด decision tree/frontier interview จาก `grilling` ใน mattpocock/skills (MIT) ให้เป็นกระบวนการท้าทายสมมติฐานที่กระชับและเหมาะกับงานบ่มเพาะ/นวัตกรรมของ STeP
