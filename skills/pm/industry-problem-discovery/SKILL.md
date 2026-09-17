---
name: industry-problem-discovery
description: ถอดโจทย์จริงจากโรงงาน ชุมชน หรือหน่วยงานภายนอก แยกอาการ ปัญหา ข้อจำกัด หลักฐาน และผลลัพธ์ที่ต้องการ ก่อนจับคู่ผู้เชี่ยวชาญหรือเสนอเทคโนโลยี
---

# STeP Industry Problem Discovery

Skill นี้ช่วย LINC, TECH-UP, TECH-SPIN, PUBSEC และทีมที่รับโจทย์จากภาคอุตสาหกรรม/ชุมชน **เข้าใจปัญหาก่อนเสนอ solution**

> **Problem first, technology later.**

## เมื่อควรใช้
- โรงงานบอกอาการกว้าง ๆ เช่น ของเสียเยอะ ผลิตช้า ต้นทุนสูง คุณภาพไม่นิ่ง
- ชุมชนหรือหน่วยงานมี pain แต่ยังไม่รู้ root problem
- ต้องเตรียม brief เพื่อจับคู่ผู้เชี่ยวชาญ/นักวิจัย
- ลูกค้าระบุ solution มาแล้ว แต่ยังไม่แน่ใจว่าแก้ปัญหาหลักจริงหรือไม่

## Discovery Frame

### 1. Observed Symptom
สิ่งที่เห็น/เกิดขึ้นจริง เช่น reject rate สูง เครื่องหยุดบ่อย ระยะเวลารอนาน

### 2. Evidence
มีข้อมูลอะไรยืนยันอาการ:
- ตัวเลข
- log
- complaint
- observation
- sample / photo / report

ถ้ายังไม่มี ให้ระบุว่าเป็น `reported symptom`

### 3. Current Process
กระบวนการปัจจุบันเป็นอย่างไร จุดไหนเกิดปัญหา ใครเกี่ยวข้อง

### 4. Current Workaround
ตอนนี้แก้เฉพาะหน้าอย่างไร และ workaround มีต้นทุน/ผลข้างเคียงอะไร

### 5. Constraints
เช่น:
- งบ
- downtime
- regulation
- material
- machine compatibility
- workforce skill
- facility / environment

### 6. Desired Outcome
เขียนเป็นผลลัพธ์ที่วัดได้โดยไม่ล็อก solution เช่น:
- ลดเวลารอ
- ลด variation
- เพิ่ม yield
- ตรวจพบ defect เร็วขึ้น

### 7. Root-Cause Hypotheses
เสนอเป็น **สมมติฐาน** ไม่ใช่ข้อสรุป และแยกสิ่งที่ต้องตรวจเพิ่ม

## Solution Neutrality Rule
หากผู้ใช้บอกว่า “อยากใช้ AI / IoT / Sensor / Automation” ให้บันทึกเป็น **proposed solution** แต่ยังต้องตรวจว่าปัญหาต้นทางคืออะไร

ห้าม rewrite ปัญหาเป็น “ขาด AI” หรือ “ไม่มีระบบดิจิทัล” โดยอัตโนมัติ

## Output เริ่มต้น

# Industry Problem Brief

**Organization / site:** …  
**Problem owner:** …

## Observed problem
…

## Evidence available
- …

## Current process & workaround
…

## Constraints
- …

## Desired outcome
- …

## Root-cause hypotheses to test
1. …

## Missing evidence / next questions
1. …

## Expert matching criteria
- Expertise needed:
- Equipment/data access needed:
- Suggested first diagnostic step:

## Guardrails
- ไม่สรุป root cause จากอาการเพียงอย่างเดียว
- ไม่รับปากผลลัพธ์ทางเทคนิคก่อน feasibility review
- ไม่เลือก vendor หรือจัดซื้อแทนเจ้าของเรื่อง
- หากโจทย์เข้าสู่การทดลองเทคโนโลยีแล้ว ให้ส่งต่อ `project-plan` / `project-pre-mortem`
- หากเป็นโอกาสเชิงธุรกิจของงานวิจัย ให้ส่งต่อ `startup-discovery` หรือ workflow commercialization

---

**Method note:** ใช้แนวทาง discovery questionnaire ที่โฟกัส knowledge gap และ solution-neutral problem framing มาปรับให้เหมาะกับงานรับโจทย์อุตสาหกรรมของ STeP
