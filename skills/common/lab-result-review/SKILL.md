---
name: lab-result-review
description: ทบทวนผลทดสอบและข้อมูลห้องปฏิบัติการเชิงหลักฐาน ตรวจความครบถ้วน หน่วย QC replicates outlier และความสอดคล้องกับ method/spec โดยไม่ออกผลรับรองหรือวินิจฉัยแทนผู้เชี่ยวชาญ
standardVersion: 2
---

# STeP Lab Result Review

## Purpose

ช่วย LES, FOODFABR, Tech Up และทีมที่ทำงานกับข้อมูลการทดลอง ตรวจ **ความสมบูรณ์และความสมเหตุผลของหลักฐานก่อนสรุปผล**

หลักสำคัญ: **Review the evidence, not just the final number**

## เมื่อควรใช้

- ผลทดสอบเชิงอุตสาหกรรมหรือวิจัย
- Prototype หรือ pilot trial results
- QC และ replicate data
- Analytical method review
- Batch comparison
- ตรวจตารางผลก่อนจัดทำรายงาน

**Anti-trigger:**
- วินิจฉัยทางการแพทย์
- รับรอง accreditation หรือ certification
- ออก official test report แทนผู้มีอำนาจ
- ตัดสิน method release โดยไม่มี qualified reviewer

## Inputs

ใช้ข้อมูลที่มี และระบุสิ่งที่ขาด:

- Test objective
- Method, instrument หรือ procedure reference
- Sample หรือ batch identity ที่จำเป็น
- Units
- Replicates
- QC, blank หรือ control ถ้ามี
- Specification หรือ acceptance criteria ถ้ามี

**หากไม่มี spec ห้ามสร้างเกณฑ์ pass/fail เอง**

## Source

- ผลและ raw data จาก source record ของห้องปฏิบัติการ
- method, spec หรือ standard ที่ผู้ใช้ระบุ หรือแหล่งล่าสุดที่ตรวจสอบได้
- **ห้ามอ้างว่าผ่าน ISO, ICH, USP หรือ CLSI เพียงเพราะตัวเลขดูสมเหตุผล**

### นโยบายการรายงานผลของห้องปฏิบัติการ

INFRI (`manifest/services.yaml` → `food-lab-testing-infri`; ชื่อเดิม/ชื่อใน source: INFLI และ NSP Central Laboratory) ประกาศนโยบายไว้ว่า **ห้องปฏิบัติการเองไม่ตัดสินผล ไม่แสดงความคิดเห็น ไม่แปลผล และไม่ระบุว่าผ่านหรือไม่ผ่านข้อกำหนด** รวมถึงรายงานค่าความไม่แน่นอนของการวัดเฉพาะเมื่อลูกค้าร้องขอ

ผลที่ตามมาสำหรับ Skill นี้:

- ถ้าแม้แต่ห้องปฏิบัติการยังไม่ตัดสิน **AI ยิ่งตัดสินแทนไม่ได้** ให้คงสถานะ `CANNOT ASSESS` แทนการเดา PASS หรือ FAIL
- รายงานผลที่ไม่มีข้อความตัดสินไม่ใช่รายงานที่บกพร่อง แต่เป็นไปตามนโยบาย
- ถ้าผู้ใช้ต้องการคำว่าผ่านหรือไม่ผ่าน ต้องเทียบกับ spec ที่เจ้าของผลิตภัณฑ์หรือผู้มีอำนาจกำหนด และให้คนตัดสิน
- ถ้าไม่มีค่าความไม่แน่นอนในรายงาน ให้ระบุว่ายังไม่ได้ร้องขอ **ห้ามประมาณค่าเอง**

นโยบายนี้มาจากอินโฟกราฟิกบริการที่ผู้ดูแลส่งเข้ามา โดยเจ้าของบริการยืนยันแล้วว่า INFRI อยู่ในความดูแลของ LES; ก่อนใช้อ้างอิงกับลูกค้าภายนอกให้ตรวจว่านโยบายฉบับล่าสุดยังไม่เปลี่ยนแปลง

## Workflow

1. **Completeness** — sample หรือ batch ครบหรือไม่ หน่วยชัดเจนและสอดคล้องหรือไม่ มี missing หรือ duplicated rows หรือไม่ ระบุ method, version และ date หรือไม่
2. **Traceability** — ผลลัพธ์ย้อนกลับไปยัง sample, run, instrument หรือ source record ได้หรือไม่
3. **Quality Controls** — ถ้ามี QC, control หรือ blank ให้ตรวจว่ามีผลหรือไม่ และอยู่ในเกณฑ์ที่ผู้ใช้หรือ method ระบุหรือไม่ หากเกณฑ์ไม่ถูกให้มา ให้ระบุ `รอยืนยันเกณฑ์ QC`
4. **Replicate Consistency** — ดูความสม่ำเสมอของ replicates และ flag ความแปรปรวนที่ควรตรวจเพิ่ม **โดยไม่สร้าง threshold เอง**
5. **Outlier Review** — outlier เป็นสัญญาณให้ตรวจ ไม่ใช่เหตุผลให้ลบทันที ระบุจุดที่ผิดปกติ เหตุผลที่สงสัย และสิ่งที่ต้องตรวจ เช่น raw data, instrument หรือ sample handling
6. **Calculation & Units** — ตรวจสูตร การแปลงหน่วย significant figures และ denominator ที่เกี่ยวข้อง
7. **Method / Spec Alignment** — เทียบเฉพาะกับ method, spec หรือ standard ที่ระบุหรือแหล่งล่าสุดที่ตรวจสอบได้
8. **Interpretation Boundary** — แยก Observed result, Calculation, Interpretation และ Decision/release สามอย่างแรกช่วยตรวจได้ ส่วน Decision และ Release ต้องเป็นผู้มีอำนาจหรือผู้เชี่ยวชาญ

## Output

```markdown
# Lab Result Review

**Objective:** …
**Method / reference:** …
**Data reviewed:** …

## Review status
- Completeness: OK / GAP
- Traceability: OK / GAP
- QC/control: OK / REVIEW / NOT PROVIDED
- Replicates: CONSISTENT / REVIEW
- Calculation & units: OK / REVIEW
- Spec alignment: PASS / FAIL / CANNOT ASSESS

## Findings
| Finding | Evidence | Risk / impact | What to check next |
|---|---|---|---|

## Questions for qualified reviewer

## Human sign-off required
```

ใช้ PASS หรือ FAIL เฉพาะเมื่อมีเกณฑ์จริงเท่านั้น

## Authority

AI ช่วยได้: ตรวจความครบถ้วน traceability การคำนวณ และความสอดคล้องกับ method ที่ระบุ

ต้องให้มนุษย์ตัดสิน:
- Official result release
- Method acceptance และ validation approval
- การตีความผลเพื่อออกใบรับรองหรือรายงานทางการ

## Handoff

- ก่อนกล่าวว่ารายงานพร้อมออกอย่างเป็นทางการ → `evidence-before-approval`
- ผลที่กลายเป็นข้อบกพร่องของระบบคุณภาพ → `ncr-capa`
- ข้อมูล clinical หรือ patient data → หยุดและส่งไป workflow ที่เหมาะสมพร้อม privacy review
- เอกสารและ record ที่ต้องควบคุม → `document-record-control`

พร้อมส่งต่อเมื่อ: ทุกหัวข้อ review มีสถานะ และคำถามสำหรับ qualified reviewer ถูกระบุครบ

## Guardrails

- ไม่สร้าง LOD, LOQ, acceptance criteria, reference range หรือ QC threshold ขึ้นเอง
- ไม่ลบ outlier โดยไม่มีเหตุผลและ traceable decision
- ไม่แต่ง replicate หรือเติม missing data
- ไม่อ้างมาตรฐานสากลโดยไม่มีหลักฐานการทดสอบตามมาตรฐานนั้น
- ไม่เขียนข้อความตัดสินแทนห้องปฏิบัติการ เช่น ผ่าน ไม่ผ่าน เป็นไปตามมาตรฐาน หรือปลอดภัยต่อการบริโภค
- ไม่ประมาณค่าความไม่แน่นอนของการวัดเมื่อรายงานไม่ได้ระบุไว้

## Method note

แนวทาง evidence-bounded analysis, method validation boundaries และ qualified review ได้แรงบันดาลใจจาก scientific-agent-skills ของ K-Dense-AI และเขียนใหม่สำหรับบริบทห้องปฏิบัติการและโรงงานต้นแบบของ STeP
