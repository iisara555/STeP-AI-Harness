---
name: voice-of-customer
description: สังเคราะห์เสียงลูกค้า Feedback Survey Complaint และบทสนทนาเป็นธีม Pain, Need, Expectation และ Opportunity โดยรักษาความหมายเดิมและระวัง Sample Bias/PII
standardVersion: 2
---

# STeP Voice of Customer

## Purpose

ช่วย CRM, MI, IFU, LES, FOODFABR และทีมบริการ เปลี่ยน feedback ที่กระจัดกระจายให้เป็น **ภาพรวมความต้องการลูกค้าที่ใช้ตัดสินใจต่อได้** โดยไม่ทำให้คำพูดลูกค้าหายไปจากการสรุป

หลักสำคัญ: **Preserve the customer's meaning before adding our interpretation**

## เมื่อควรใช้

- มี feedback, survey, complaint หรือบทสนทนาจำนวนมากที่ต้องสรุป
- ต้องการรู้ว่าปัญหาของลูกค้าเกิดที่ช่วงใดของการรับบริการ
- ต้องการจัดลำดับสิ่งที่ควรแก้ก่อน

**Anti-trigger:**
- คำถามหรือข้อร้องเรียนรายกรณี → `customer-support-faq-triage`
- การสแกนสัญญาณตลาด → `market-signal-radar`
- การทดสอบสมมติฐานตลาดกับลูกค้าใหม่ → `startup-discovery`

## Inputs

รองรับ: survey comments, complaint หรือ inquiry logs, interview notes, call หรือ chat summaries, review และ feedback forms, service satisfaction notes

**Privacy Gate ก่อนวิเคราะห์:**
- ตัด PII ที่ไม่จำเป็น เช่น เบอร์โทร เลขบัตร ที่อยู่ส่วนตัว
- ถ้าข้อมูลอ่อนไหวหรือระบุบุคคลได้ ให้ใช้ `data-privacy-compliance`
- ไม่เผยแพร่ quote ที่ทำให้ระบุตัวบุคคลได้โดยไม่จำเป็น

## Source

- แหล่งเดียวคือ **เสียงลูกค้าที่บันทึกไว้จริง** ไม่เติม sentiment หรือ quote ที่ไม่มีใน source
- ระบุ sample size, ช่วงเวลา และ bias ที่ทราบทุกครั้ง
- ถ้าอ้างถึงเงื่อนไขบริการ ให้ resolve จาก `manifest/services.yaml` และเจ้าของบริการ

## Workflow

1. **Preserve Raw Meaning** — อย่า rewrite feedback ทุกชิ้นเป็นภาษาราชการก่อน coding เพราะอาจทำให้ pain จริงหาย
2. **Code by Meaning** — จัดกลุ่มตามความหมาย: Need หรือ Job to be done, Friction หรือ Pain, Expectation, Positive driver, Confusion หรือ Information gap, Service failure, Improvement request
3. **Separate Frequency from Severity** — เรื่องที่พูดบ่อยไม่จำเป็นต้องรุนแรงที่สุด และเรื่องรุนแรงอาจเกิดไม่บ่อย **หาก sample ไม่ represent ลูกค้าทั้งหมด ห้ามใช้คำว่า "ลูกค้าส่วนใหญ่"**
4. **Identify Moment in Journey** — ระบุช่วง Before service, Booking/intake, During service, Delivery/result หรือ Follow-up
5. **Extract Underlying Need** — เปลี่ยนคำขอ solution เช่น "อยากให้มี LINE bot" เป็น need ที่กว้างกว่า เช่น "ต้องการรู้สถานะได้เร็วโดยไม่ต้องโทรถาม" โดยเก็บ solution request เดิมไว้ด้วย
6. **Opportunity** — เสนอ improvement เป็น hypothesis ไม่ใช่สรุปว่าลูกค้าจะชอบแน่นอน

## Output

```markdown
# Voice of Customer Summary

**Source:** …
**Period:** …
**Sample size / coverage:** …
**Known bias:** …

| Theme | Customer meaning | Frequency signal | Severity | Journey stage | Evidence |
|---|---|---|---|---|---|

## Top unmet needs

## Friction worth fixing first

## Representative customer language
- "…" — anonymized / source reference

## Improvement hypotheses

## Questions still unanswered
```

## Authority

AI ช่วยได้: สังเคราะห์ธีม จัดลำดับ และเสนอ hypothesis

ต้องให้มนุษย์ตัดสิน:
- การเปลี่ยนแปลงบริการหรือเงื่อนไขการให้บริการ ซึ่งเป็นอำนาจของเจ้าของบริการ
- การติดต่อหรือตอบกลับลูกค้ารายบุคคล
- การเผยแพร่ผลสรุปที่มีคำพูดของลูกค้า

## Handoff

- คำถามหรือข้อร้องเรียนรายกรณี → `customer-support-faq-triage`
- market validation ต่อจาก VOC → `market-signal-radar` หรือ `startup-discovery`
- ข้อมูลอ่อนไหว → `data-privacy-compliance`
- ปัญหาที่กลายเป็นข้อบกพร่องของระบบคุณภาพ → `ncr-capa`

พร้อมส่งต่อเมื่อ: ทุกธีมมีหลักฐานอ้างอิง และระบุ sample กับ bias ไว้ชัด

## Guardrails

- ห้ามแต่ง quote หรือเติม sentiment ที่ไม่มีใน source
- ห้ามตีความ sample เล็กเป็น market prevalence
- แยก complaint ออกจาก feature request และ underlying need
- **หากจะติดต่อหรือส่งต่อเคสลูกค้า ให้ใช้ workflow CRM จริง ไม่ดำเนินการแทนจากข้อมูลสรุป**

## Method note

ใช้หลัก knowledge-gap questionnaire และ evidence-preserving synthesis มาปรับเป็น VOC workflow สำหรับงานบริการและลูกค้าสัมพันธ์ของ STeP
