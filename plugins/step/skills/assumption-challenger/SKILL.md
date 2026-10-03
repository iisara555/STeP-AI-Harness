---
name: assumption-challenger
description: ท้าทายและจัดลำดับสมมติฐานของโครงการ ธุรกิจ หรือนวัตกรรมก่อนลงทุนลงมือจริง แยก Fact, Assumption, Decision และออกแบบการทดสอบที่ประหยัดที่สุด
standardVersion: 2
---

# STeP Assumption Challenger

## Purpose

ช่วย PITI, ISI, EIC, MI, Tech Spin และทีมโครงการ **ค้นหาสิ่งที่กำลังเชื่อโดยยังไม่มีหลักฐาน** แล้วเปลี่ยนสมมติฐานสำคัญให้เป็นคำถามและการทดลองที่ตรวจได้ ก่อนลงทุนลงมือจริง

หลักสำคัญ: **Challenge the assumption, not the person**

## เมื่อควรใช้

- ไอเดียดูดีแต่ยังไม่รู้ว่าลูกค้าต้องการจริงหรือไม่
- ทีมเริ่มออกแบบ solution ก่อนยืนยัน problem
- มีการใช้คำว่า "น่าจะ", "คง", "ทุกคน", "ตลาดต้องการ", "ทำได้แน่" โดยไม่มี evidence
- ต้อง stress-test proposal ก่อนเสนอผู้บริหารหรือ mentor

**Anti-trigger:**
- เป็น customer discovery จริง ให้ใช้ `startup-discovery` สำหรับ VPC และ The Mom Test
- เป็นความเสี่ยงก่อนเริ่มโครงการที่มี scope ชัดแล้ว ให้ใช้ `project-pre-mortem`
- ต้องการเอกสารเพื่อตัดสินใจ ให้ใช้ `decision-memo`

## Inputs

ขั้นต่ำ:
- brief, proposal หรือบทสนทนาที่มีข้ออ้างของทีม

ช่วยให้ท้าทายได้ตรงจุดขึ้นถ้ามี:
- หลักฐานที่ทีมใช้อยู่แล้ว
- ข้อจำกัดด้านงบ เวลา หรือเทคโนโลยี

## Source

- หลักฐานต้องมาจากข้อมูลจริง เช่น การสัมภาษณ์ ตัวเลข หรือเอกสาร ไม่ใช่ความเห็นของคนในทีม
- ถ้า AI ค้น fact จากเอกสารหรือแหล่งข้อมูลได้เอง ให้ค้นเอง ไม่โยนกลับให้ผู้ใช้
- ถ้าไม่มี source ภายนอกที่จำเป็น ให้ระบุว่าใช้ข้ออ้างของทีมเป็นจุดตั้งต้นเท่านั้น

## Workflow

**จัดทุกประเด็นเป็นหนึ่งใน 4 ประเภท:** FACT (มีหลักฐานตรวจสอบแล้ว), ASSUMPTION (เชื่อว่าจริงแต่ต้องพิสูจน์), DECISION (ทางเลือกที่เจ้าของงานต้องตัดสิน), UNKNOWN (ยังไม่มีข้อมูลพอแม้จะตั้งสมมติฐาน)

1. **Extract** — ดึง statement ที่เป็นสมมติฐานจาก brief, proposal หรือบทสนทนา
2. **Rank** — Critical (ถ้าผิด แนวทางหลักพัง), Important (ถ้าผิด ต้องปรับแผนมาก), Monitor (ถ้าผิด ยังเดินต่อได้)
3. **Ask the Frontier** — ถามเฉพาะคำถามที่ปลดล็อกการตัดสินใจได้มากที่สุดตอนนี้ ไม่เกิน 3-5 คำถามต่อรอบ
4. **Cheapest Valid Test** — สำหรับ Critical Assumption เสนอวิธีทดสอบที่เร็วและถูกที่สุดที่ยังตอบคำถามได้ เช่น interview, landing-page หรือ message test, prototype walkthrough, desk research, technical spike, small pilot, manual concierge test
5. **Define Evidence Threshold** — ก่อนทดสอบ ระบุว่าผลแบบไหนจะ Support, Weaken หรือ Invalidate สมมติฐาน

**Assumption Map** ตรวจอย่างน้อย 6 มิติเมื่อเกี่ยวข้อง: Problem (ปัญหาเกิดจริงและสำคัญพอหรือไม่), Customer/User (ใครมีปัญหาและใครตัดสินใจ), Value (สร้างคุณค่าที่ผู้ใช้รับรู้หรือไม่), Behavior/Adoption (ผู้ใช้จะเปลี่ยนพฤติกรรมหรือไม่), Feasibility (เทคโนโลยี กระบวนการ บุคลากรทำได้จริงหรือไม่), Viability (งบ รายได้ ต้นทุน partner หรือ policy dependency สมเหตุผลหรือไม่)

## Output

### Assumption Register

| Assumption | Type | Criticality | Current Evidence | Cheapest Test | Decision After Test |
|---|---|---|---|---|---|

จากนั้นสรุป:
- **Top 3 assumptions to test now**
- **Questions to ask next**
- **What not to build yet**

## Authority

AI ช่วยได้: แยกประเภทข้ออ้าง จัดลำดับความสำคัญ ออกแบบการทดสอบ และกำหนดเกณฑ์หลักฐาน

ต้องให้มนุษย์ตัดสิน:
- การตัดสินใจลงทุน เดินหน้า หรือยุติแนวทาง
- การอนุมัติงบสำหรับการทดสอบ — `budget-allocation`

**ห้ามคิดแทนผู้ใช้ใน decision ที่มีอำนาจอนุมัติ**

## Handoff

- customer discovery → `startup-discovery`
- ความเสี่ยงก่อนเริ่มโครงการ → `project-pre-mortem`
- ต้องเสนอผู้บริหารเพื่อตัดสินใจ → `decision-memo`
- โจทย์จากภาคอุตสาหกรรมที่ยังไม่ชัด → `industry-problem-discovery`

พร้อมส่งต่อเมื่อ: Critical Assumption ทุกข้อมีวิธีทดสอบและเกณฑ์หลักฐานที่ตกลงแล้ว

## Guardrails

- **ห้ามเปลี่ยน ASSUMPTION เป็น FACT เพียงเพราะดูสมเหตุผล**
- ห้าม validate จากความคิดเห็นของคนในทีมเอง
- ห้ามนับคำชมว่าเป็น willingness-to-pay หรือ adoption evidence
- ไม่สร้างความแม่นยำเกินจริงในการจัดระดับความสำคัญ
- ท้าทายข้ออ้าง ไม่ใช่ตัวบุคคล

## Method note

ปรับแนวคิด decision tree และ frontier interview จาก `grilling` ใน mattpocock/skills (MIT) ให้เป็นกระบวนการท้าทายสมมติฐานที่กระชับและเหมาะกับงานบ่มเพาะและนวัตกรรมของ STeP
