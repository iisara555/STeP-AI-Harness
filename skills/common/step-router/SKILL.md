---
name: step-router
description: ชั้นแรกของระบบ STeP AI สำหรับคัดเลือก Domain Skill และ References ด้วยหลักการ Progressive Disclosure ป้องกันการโหลดข้อมูลเกินจำเป็น
---

# STeP Skill Router

ระบบนำทางอัจฉริยะ (Layer 1) ประจำองค์กร **STeP / RSP North** ทำหน้าที่คัดเลือกทักษะที่เกี่ยวข้องจาก **22 ทีมขององค์กร** โดยอาศัยความเข้าใจองค์กร **6 มิติ** และใช้หลักการ **Progressive Disclosure** เพื่อประหยัด Context และ Token สูงสุด

> **Single Source of Truth:**
> รายชื่อทักษะ, Triggers, Keywords, Paths และ Scope Guard ทั้งหมดถูกควบคุมและจัดเก็บอยู่ที่ `manifest/router-index.yaml` เพียงแห่งเดียว Router Skill นี้ทำหน้าที่กำหนดอัลกอริทึมและพฤติกรรมของ Agent โดยไม่มีการสำเนาหรือฮาร์ดโค้ดรายชื่อ Skill ซ้ำ

---

## 🏛️ โครงสร้างองค์กร 6 มิติ (STeP Organization Knowledge Model)

Router ประเมินบริบทงานตาม 6 มิติขององค์กร:
1. **WHO (ใครทำ)**: บทบาทของ AI Agent จาก `manifest/roles.yaml`
2. **WHERE (หน่วยงานไหน)**: ผัง 22 ทีม 5 กลุ่มงานจาก `manifest/teams.yaml`
3. **WHAT (มาตรฐานอะไร)**: ทักษะและข้อกำหนดจาก `manifest/skills.yaml`
4. **WHY (บริการอะไร)**: แผนงานและบริการอุทยานฯ จาก `manifest/services.yaml`
5. **HOW (กระบวนการใด)**: ขั้นตอนการทำงานและ SOP จาก `manifest/processes.yaml`
6. **AUTHORITY (ใครมีอำนาจตัดสินใจ)**: สิทธิ์การอนุมัติ Human-in-the-loop จาก `manifest/authority.yaml`

---

## กฎทองคำ: Installed ≠ Loaded

การรัน `step-ai init --team <team>` หมายถึง:
- **Set Team Context**: กำหนดบริบทเริ่มต้นเป็นทีมนั้น
- **Install Skill Index**: ติดตั้งดัชนีการค้นหาทักษะ (Level 0 Metadata)
- **Make Skills Discoverable**: ทำให้ Agent ทราบว่าองค์กรมีทักษะใดบ้าง

**แต่ไม่ได้หมายถึงการโหลดเนื้อหาของทุก Skill เข้าสู่หน่วยความจำพร้อมกัน!**
Agent จะเปิดอ่านเนื้อหาทีละ Skill เมื่อมีคำสั่งที่ตรงกับเงื่อนไขเท่านั้น

---

## 4-Level Progressive Disclosure (Loading Budget)

```text
Level 0: Registry / Metadata (router-index.yaml ~KB)
             ↓
Level 1: Active Domain Skill (SKILL.md เพียง 1 ตัว)
             ↓
Level 2: Mandatory Rules & SOPs (rules/*.md เมื่อคำขอเรียกหาเงื่อนไข)
             ↓
Level 3: Templates & Examples (เฉพาะเมื่อต้องเทียบผลลัพธ์)
```

1. **Level 0 (Metadata)**: สแกนโครงสร้างโฟลเดอร์ นามสกุลไฟล์ และคำขอของผู้ใช้ โดยยังไม่อ่านตัวเอกสาร
2. **Level 1 (Domain Skill)**: โหลดเฉพาะ `SKILL.md` ของทักษะที่ได้รับคัดเลือกเพียง 1 ตัว ตรวจสอบ Scope Guard ก่อนลงมือ
3. **Level 2 (Mandatory Rules & SOPs)**: หากคำขอเกี่ยวข้องกับความลับ ข้อมูลส่วนบุคคล หรือระเบียบจัดซื้อ จึงเปิด `rules/data-classification.md` หรือ `rules/human-approval.md` ตามที่ระบุในเอกสารควบคุม
4. **Level 3 (Templates & Examples)**: 0 ไฟล์เป็นค่าเริ่มต้น ห้ามเปิดตัวอย่างเอกสารหรือคู่มือฉบับเต็มโดยไม่จำเป็น เปิดเฉพาะเมื่อผู้ใช้ต้องการให้จัดรูปแบบเทียบเคียง

---

## เกณฑ์การตัดสินใจด้วย Deterministic 5-Factor Scoring Model

Agent คำนวณคะแนนทางคณิตศาสตร์จาก 5 ปัจจัย (คะแนนรวม 0.00 – 1.00):

$$\text{Score} = (\text{Intent} \times 0.30) + (\text{Keyword} \times 0.25) + (\text{Path} \times 0.20) + (\text{Team} \times 0.15) + (\text{FileType} \times 0.10)$$

*(ค่าน้ำหนักและเกณฑ์คะแนนสามารถปรับเปลี่ยนได้ผ่านบล็อก `routing.scoring` ใน `router-index.yaml`)*

- **Intent Match (30%)**: คำกริยาตรงกับเจตนาของ Skill (review, create, summarize, plan, deploy, triage)
- **Keyword Match (25%)**: มีคำหรือวลีสำคัญตรงกับ triggers ใน `router-index.yaml`
- **Path Match (20%)**: อยู่ในโฟลเดอร์งานที่ระบุใน paths (เช่น `**/TOR/**`, `**/CC/**`, `**/QS/**`)
- **Team Context (15%)**: ตรงกับทีมเจ้าของ (Primary: 15%) หรือทีมร่วมใช้งาน (Consumer: 10.5%)
- **File Type Match (10%)**: พบไฟล์นามสกุลที่เกี่ยวข้องในโฟลเดอร์ (เช่น `.docx`, `.xlsx`, `.ai`)

### การตัดเกณฑ์และกระบวนการคลายความกำกวม (Disambiguation Protocol)

- **Score $\ge 0.80$ (HIGH Tier)**: เปิดใช้งาน Domain Skill นั้นทันทีโดยไม่ต้องถามยืนยัน
- **Score $0.50 – 0.79$ (AMBIGUOUS Tier)**:
  1. **สแกน Cheap Context ก่อนเสมอ**: ตรวจสอบชื่อไฟล์ที่เปิดอยู่, Frontmatter 5-10 บรรทัดแรก, หรือ README/package.json สั้นๆ
  2. **คำนวณคะแนนใหม่ (Rescore)** ด้วย Cheap Context
  3. หากคะแนนถูกยกระดับเป็น $\ge 0.80$ ให้เริ่มทำงานได้ทันที
  4. หากคะแนนยังคงก้ำกึ่งอยู่จริง ค่อยถามผู้ใช้ให้เลือกหรือยืนยัน
- **Score $< 0.50$ (FALLBACK Tier)**: ตอบในฐานะผู้ช่วยทั่วไป และสอบถามเจตนาเพิ่มเติม

---

## ขอบเขตการทำงาน 3 สถานะ (3-Outcome Scope Guard)

ทุก Skill มีการกำหนดขอบเขตใน `router-index.yaml`:
1. **ALLOW**: คำขออยู่ในขอบเขต (`scope.allow`) ดำเนินการต่อได้ทันที
2. **ESCALATE**: คำขอเป็นงานของ Domain Skill อื่น (`scope.escalate`) ส่งต่องานไปยัง Skill เป้าหมาย
3. **BLOCK / HUMAN_ONLY**: คำขอต้องอาศัยอำนาจตัดสินใจของมนุษย์ (`scope.human_only` เช่น อนุมัติจัดซื้อ อนุมัติวงเงิน ลงนามสัญญา) ยุติการทำงานในส่วนนั้นอย่างสุภาพและแจ้งผู้มีอำนาจรับผิดชอบตาม `manifest/authority.yaml`

---

## Canonical Concept: `/ask_step`

`/ask_step` คือแนวคิดกลางสำหรับผู้ใช้ในการสั่งงานอัตโนมัติ (Adapters จะแปลงเป็นคำสั่งตามความสามารถของแต่ละเครื่องมือ):
1. ทำ Context Scan และคำนวณคะแนนตาม 5 ปัจจัย
2. หากก้ำกึ่ง ให้เรียกใช้ Cheap Context Disambiguation ก่อน
3. แสดงแท็กสรุปสั้นๆ (Routing Tag):
   ```text
   [STeP Router] Team: <ทีม> | Intent: <เจตนา> | Active Skill: <ชื่อ-skill>
   ```
4. ดำเนินงานตามขั้นตอนของ Skill นั้นโดยรักษา Loading Budget
