---
name: voice-of-customer
description: สังเคราะห์เสียงลูกค้า Feedback Survey Complaint และบทสนทนาเป็นธีม Pain, Need, Expectation และ Opportunity โดยรักษาความหมายเดิมและระวัง Sample Bias/PII
---

# STeP Voice of Customer

Skill นี้ช่วย CRM, MI, IFU, LES, FOODFABR และทีมบริการ เปลี่ยน feedback ที่กระจัดกระจายให้เป็น **ภาพรวมความต้องการลูกค้าที่ใช้ตัดสินใจต่อได้** โดยไม่ทำให้คำพูดลูกค้าหายไปจากการสรุป

> **Preserve the customer's meaning before adding our interpretation.**

## Input ที่ใช้ได้
- Survey comments
- Complaint / inquiry logs
- Interview notes
- Call / chat summaries
- Review / feedback forms
- Service satisfaction notes

## Privacy Gate
ก่อนวิเคราะห์:
- ตัด PII ที่ไม่จำเป็น เช่น เบอร์โทร เลขบัตร ที่อยู่ส่วนตัว
- หากข้อมูลอ่อนไหวหรือระบุบุคคลได้ ให้ใช้ `data-privacy-compliance`
- ไม่เผยแพร่ quote ที่ทำให้ระบุตัวบุคคลได้โดยไม่จำเป็น

## VOC Workflow

### 1. Preserve Raw Meaning
อย่า rewrite feedback ทุกชิ้นเป็นภาษาราชการก่อน coding เพราะอาจทำให้ pain จริงหาย

### 2. Code by Meaning
จัดกลุ่มตามความหมาย เช่น:
- Need / Job to be done
- Friction / Pain
- Expectation
- Positive driver
- Confusion / Information gap
- Service failure
- Improvement request

### 3. Separate Frequency from Severity
เรื่องที่พูดบ่อยไม่จำเป็นต้องรุนแรงที่สุด และเรื่องรุนแรงอาจเกิดไม่บ่อย

หาก sample ไม่ represent ลูกค้าทั้งหมด ห้ามใช้คำว่า “ลูกค้าส่วนใหญ่”

### 4. Identify Moment in Journey
ถ้าเป็นงานบริการ ให้ระบุช่วง:
- Before service
- Booking / intake
- During service
- Delivery / result
- Follow-up

### 5. Extract Underlying Need
เปลี่ยนคำขอ solution เช่น “อยากให้มี LINE bot” เป็น need ที่กว้างกว่า เช่น “ต้องการรู้สถานะได้เร็วโดยไม่ต้องโทรถาม” โดยเก็บ solution request เดิมไว้ด้วย

### 6. Opportunity
เสนอ improvement เป็น hypothesis ไม่ใช่สรุปว่าลูกค้าจะชอบแน่นอน

## Output เริ่มต้น

# Voice of Customer Summary

**Source:** …  
**Period:** …  
**Sample size / coverage:** …  
**Known bias:** …

| Theme | Customer meaning | Frequency signal | Severity | Journey stage | Evidence |
|---|---|---|---|---|---|

## Top unmet needs
1. …

## Friction worth fixing first
1. …

## Representative customer language
- “…“ — anonymized / source reference

## Improvement hypotheses
1. …

## Questions still unanswered
1. …

## Guardrails
- ห้ามแต่ง quote หรือเติม sentiment ที่ไม่มีใน source
- ห้ามตีความ sample เล็กเป็น market prevalence
- แยก complaint จาก feature request และ underlying need
- หากจะติดต่อ/ส่งต่อเคสลูกค้า ให้ใช้ workflow CRM จริง ไม่ดำเนินการแทนจากข้อมูลสรุป
- งาน market validation ต่อจาก VOC → `market-signal-radar` / `startup-discovery`

---

**Method note:** ใช้หลัก knowledge-gap questionnaire และ evidence-preserving synthesis มาปรับเป็น VOC workflow สำหรับงานบริการและลูกค้าสัมพันธ์ของ STeP
