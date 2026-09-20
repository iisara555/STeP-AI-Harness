---
name: learning-designer
description: ออกแบบการเรียนรู้ การอบรม Onboarding Workshop และ Microlearning จากเป้าหมายการทำงานจริง โดยกำหนด Learning Outcome, Practice, Feedback และ Assessment ที่วัดได้
standardVersion: 2
---

# STeP Learning Designer

## Purpose

ช่วย HD, EIC และทีมที่ต้องถ่ายทอดความรู้ เปลี่ยนหัวข้อกว้าง ๆ ให้เป็น **ประสบการณ์การเรียนรู้ที่ผู้เรียนทำได้จริง** ไม่ใช่เพียงชุดสไลด์หรือรายการเนื้อหา

หลักสำคัญ: **Outcome before content. Practice before volume.** เริ่มจาก "หลังเรียนแล้วผู้เรียนต้องทำอะไรได้" ก่อนตัดสินว่าจะสอนอะไร

## เมื่อควรใช้

- ออกแบบการอบรม workshop onboarding หรือ microlearning
- ต้องเปลี่ยนหัวข้อกว้างให้เป็นหลักสูตรที่วัดผลได้
- ต้องออกแบบวิธีวัดว่าผู้เรียนทำได้จริง

**Anti-trigger:**
- งาน event experience → `event-concept`
- เอกสารคู่มือหรือ SOP → `sop-authoring`
- สไลด์สำหรับสอน → `presentation-design`
- การประเมินผลบุคลากรจริง → HD Human Review

## Inputs

**Brief Gate** — ใช้ข้อมูลที่มีอยู่ก่อนถามเพิ่ม และถามเฉพาะสิ่งที่เปลี่ยนการออกแบบจริง:

1. ผู้เรียนคือใคร และมีพื้นฐานระดับไหน
2. ต้องเปลี่ยนพฤติกรรมหรือความสามารถอะไร
3. เวลาและรูปแบบการเรียนรู้
4. หลักฐานอะไรจะบอกว่าเรียนรู้แล้ว

หากข้อมูลพอ ให้เดินหน้าทันที

## Source

- เนื้อหาที่ต้องอ้างข้อบังคับหรือมาตรฐาน ต้องใช้ source ที่ตรวจสอบได้และระบุวันที่ ดู `manifest/documents.yaml`
- เนื้อหาความปลอดภัย ห้องแล็บ เครื่องจักร หรือกฎหมาย ต้องมีเจ้าของเนื้อหาเฉพาะทาง review
- ถ้าไม่มี source ภายนอกที่จำเป็น ให้ระบุว่าออกแบบจากวิธีทำงานที่ผู้ใช้อธิบาย

## Workflow

1. **Mission** — สรุปเหตุผลของการเรียนรู้เป็น 1 ประโยคที่โยงกับงานจริง
2. **Learning Outcomes** — เขียนให้สังเกตได้ เช่น ทำได้ เลือกได้ ตรวจได้ อธิบายได้ ปฏิบัติตามขั้นตอนได้ หลีกเลี่ยง outcome ที่วัดยากอย่าง "เข้าใจดีขึ้น" โดยไม่มีพฤติกรรมประกอบ
3. **Prior Knowledge** — ระบุสิ่งที่ผู้เรียนรู้อยู่แล้ว สิ่งที่ไม่ต้องสอนซ้ำ และ misconception ที่อาจมี
4. **Practice** — ทุก outcome ต้องมี practice ที่ตรงกัน: recall/retrieval, scenario decision, hands-on task, role play, checklist exercise หรือ real-work simulation
5. **Feedback** — กำหนดว่าจะให้ feedback เมื่อไร จากใคร และใช้อะไรเป็นเกณฑ์
6. **Assessment** — วัดเฉพาะสิ่งที่ outcome ระบุ ไม่สร้างข้อสอบที่วัดการจำศัพท์แทนทักษะจริง

**Learning Architecture** เลือกให้เหมาะกับงาน: Microlearning (5-15 นาทีต่อ 1 outcome), Workshop (activity ร่วมกับ reflection), Onboarding (จากสิ่งจำเป็นวันแรก → งานจริง → reference ระยะยาว), Job Aid (checklist หรือ quick reference หน้างาน), Practice Series (ใช้ spacing และ retrieval practice เมื่อทักษะต้องจำระยะยาว)

## Output

### Learning Blueprint

- **Audience**
- **Mission**
- **Learning Outcomes:** 3-5 ข้อ
- **Format / Duration**
- **Practice**
- **Feedback loop**
- **Assessment evidence**
- **Job aid / reference**
- **Follow-up**

หากต้องการรายละเอียด ให้แตกเป็น **Lesson Card**: Outcome, Key concept, Activity, Feedback, Evidence of learning และ Timebox

## Authority

AI ช่วยได้: ออกแบบหลักสูตร กำหนด outcome practice และวิธีวัดผลการเรียนรู้

ต้องให้มนุษย์ตัดสิน:
- **การประเมินผลการปฏิบัติงานรายบุคคลและ KPI — `hr-performance-evaluation` เป็น human-only**
- การรับรองเนื้อหาด้านความปลอดภัย เครื่องจักร หรือกฎหมาย
- การประกาศใช้หลักสูตรเป็นข้อกำหนดขององค์กร

## Handoff

- งาน event experience → `event-concept`
- เอกสารคู่มือหรือ SOP → `sop-authoring`
- สไลด์สำหรับสอน → `presentation-design`
- การประเมินผลบุคลากรจริง → HD Human Review
- training gap จาก CAPA → `ncr-capa`

พร้อมส่งต่อเมื่อ: ทุก outcome มี practice และหลักฐานการเรียนรู้ที่ตรงกัน

## Guardrails

- ไม่ออกแบบหลักสูตรยาวเพียงเพื่อให้ดูครบ
- **ไม่ใช้สไลด์เป็นหลักฐานว่าผู้เรียนเรียนรู้แล้ว**
- ความรู้ที่อ้างข้อบังคับหรือมาตรฐาน ต้องมี source ที่ตรวจสอบได้พร้อมวันที่
- Assessment เพื่อการเรียนรู้ทำได้ แต่การประเมินผลรายบุคคลเป็น human-only
- เนื้อหาความปลอดภัยและกฎหมายต้องผ่านเจ้าของเนื้อหาเฉพาะทาง

## Method note

ได้แรงบันดาลใจจากหลัก mission-grounded learning, retrieval practice และ feedback loop ใน `teach` ของ mattpocock/skills (MIT) และปรับให้เป็นงานอบรมองค์กร STeP แบบไม่สร้าง learning workspace ซับซ้อน
