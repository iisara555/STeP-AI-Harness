---
name: industry-problem-discovery
description: ถอดโจทย์จริงจากโรงงาน ชุมชน หรือหน่วยงานภายนอก แยกอาการ ปัญหา ข้อจำกัด หลักฐาน และผลลัพธ์ที่ต้องการ ก่อนจับคู่ผู้เชี่ยวชาญหรือเสนอเทคโนโลยี
standardVersion: 2
---

# STeP Industry Problem Discovery

## Purpose

ช่วย LINC, Tech Up, Tech Spin, PubSec และทีมที่รับโจทย์จากภาคอุตสาหกรรมและชุมชน **เข้าใจปัญหาก่อนเสนอ solution**

หลักสำคัญ: **Problem first, technology later**

## เมื่อควรใช้

- โรงงานบอกอาการกว้าง ๆ เช่น ของเสียเยอะ ผลิตช้า ต้นทุนสูง คุณภาพไม่นิ่ง
- ชุมชนหรือหน่วยงานมี pain แต่ยังไม่รู้ root problem
- ต้องเตรียม brief เพื่อจับคู่ผู้เชี่ยวชาญหรือนักวิจัย
- ลูกค้าระบุ solution มาแล้ว แต่ยังไม่แน่ใจว่าแก้ปัญหาหลักจริงหรือไม่

**Anti-trigger:**
- โจทย์ชัดแล้วและต้องการหาทรัพยากร ให้ใช้ `expert-resource-matching`
- เป็นโอกาสเชิงธุรกิจของงานวิจัย ให้ใช้ `startup-discovery`
- เข้าสู่การวางแผนดำเนินงานแล้ว ให้ใช้ `project-plan`

## Inputs

ขั้นต่ำ:
- อาการหรือปัญหาที่หน่วยงานภายนอกแจ้งมา
- ประเภทกิจการหรือกระบวนการที่เกี่ยวข้อง

ช่วยให้ถอดโจทย์ได้ลึกขึ้นถ้ามี:
- ข้อมูลยืนยันอาการ เช่น ตัวเลข log complaint sample photo หรือ report
- ข้อจำกัดด้านงบ เวลา เครื่องจักร หรือกฎระเบียบ

## Source

- แหล่งหลักคือ **คำบอกเล่าและข้อมูลจากหน้างานจริง**
- ถ้ายังไม่มีหลักฐานยืนยันอาการ ให้ระบุว่าเป็น `reported symptom` ไม่ใช่ข้อเท็จจริง
- ถ้าอ้างถึงมาตรฐานหรือข้อกำหนด ให้ resolve จาก `manifest/documents.yaml`

## Workflow

1. **Observed Symptom** — สิ่งที่เห็นหรือเกิดขึ้นจริง เช่น reject rate สูง เครื่องหยุดบ่อย ระยะเวลารอนาน
2. **Evidence** — มีข้อมูลอะไรยืนยันอาการ: ตัวเลข, log, complaint, observation, sample/photo/report ถ้ายังไม่มี ให้ระบุว่าเป็น reported symptom
3. **Current Process** — กระบวนการปัจจุบันเป็นอย่างไร จุดไหนเกิดปัญหา ใครเกี่ยวข้อง
4. **Current Workaround** — ตอนนี้แก้เฉพาะหน้าอย่างไร และ workaround มีต้นทุนหรือผลข้างเคียงอะไร
5. **Constraints** — งบ, downtime, regulation, material, machine compatibility, workforce skill, facility หรือ environment
6. **Desired Outcome** — เขียนเป็นผลลัพธ์ที่วัดได้โดยไม่ล็อก solution เช่น ลดเวลารอ ลด variation เพิ่ม yield ตรวจพบ defect เร็วขึ้น
7. **Root-Cause Hypotheses** — เสนอเป็นสมมติฐาน ไม่ใช่ข้อสรุป และแยกสิ่งที่ต้องตรวจเพิ่ม

**Solution Neutrality Rule** — ถ้าผู้ใช้บอกว่าอยากใช้ AI, IoT, Sensor หรือ Automation ให้บันทึกเป็น proposed solution แต่ยังต้องตรวจว่าปัญหาต้นทางคืออะไร **ห้าม rewrite ปัญหาเป็น "ขาด AI" หรือ "ไม่มีระบบดิจิทัล" โดยอัตโนมัติ**

## Output

```markdown
# Industry Problem Brief

**Organization / site:** …
**Problem owner:** …

## Observed problem

## Evidence available

## Current process & workaround

## Constraints

## Desired outcome

## Root-cause hypotheses to test

## Missing evidence / next questions

## Expert matching criteria
- Expertise needed:
- Equipment/data access needed:
- Suggested first diagnostic step:
```

## Authority

AI ช่วยได้: ถอดโจทย์ ตั้งสมมติฐาน และเตรียม brief สำหรับจับคู่ผู้เชี่ยวชาญ

ต้องให้มนุษย์ตัดสิน:
- การรับปากผลลัพธ์ทางเทคนิคกับหน่วยงานภายนอก
- การเลือก vendor หรือการจัดซื้อ — `procurement-approval`
- ขอบเขตและเงื่อนไขการให้บริการ ซึ่งเป็นอำนาจของเจ้าของบริการ

## Handoff

- โจทย์ชัดแล้วและต้องหาทรัพยากร → `expert-resource-matching`
- เข้าสู่การทดลองเทคโนโลยี → `project-plan` และ `project-pre-mortem`
- เป็นโอกาสเชิงธุรกิจของงานวิจัย → `startup-discovery`
- ต้องท้าทายสมมติฐานก่อนลงทุน → `assumption-challenger`

พร้อมส่งต่อเมื่อ: แยกอาการออกจากสาเหตุได้ มี desired outcome ที่วัดได้ และระบุหลักฐานที่ยังขาด

## Guardrails

- ไม่สรุป root cause จากอาการเพียงอย่างเดียว
- ไม่รับปากผลลัพธ์ทางเทคนิคก่อน feasibility review
- ไม่เลือก vendor หรือจัดซื้อแทนเจ้าของเรื่อง
- แยก reported symptom ออกจาก verified evidence เสมอ

## Method note

ใช้แนวทาง discovery questionnaire ที่โฟกัส knowledge gap และ solution-neutral problem framing มาปรับให้เหมาะกับงานรับโจทย์อุตสาหกรรมของ STeP
