---
name: lab-result-review
description: ทบทวนผลทดสอบและข้อมูลห้องปฏิบัติการเชิงหลักฐาน ตรวจความครบถ้วน หน่วย QC replicates outlier และความสอดคล้องกับ method/spec โดยไม่ออกผลรับรองหรือวินิจฉัยแทนผู้เชี่ยวชาญ
---

# STeP Lab Result Review

Skill นี้ช่วย LES, FOODFABR, TECH-UP และทีมที่ทำงานกับข้อมูลการทดลอง/ทดสอบ ตรวจ **ความสมบูรณ์และความสมเหตุผลของ evidence ก่อนสรุปผล**

> **Review the evidence, not just the final number.**

## Scope
เหมาะกับ:
- ผลทดสอบเชิงอุตสาหกรรม/วิจัย
- Prototype / pilot trial results
- QC / replicate data
- Analytical method review
- Batch comparison
- Result table ก่อนจัดทำรายงาน

ไม่ใช้เพื่อ:
- วินิจฉัยทางการแพทย์
- รับรอง accreditation / certification
- ออก official test report แทนผู้มีอำนาจ
- ตัดสิน method release โดยไม่มี qualified reviewer

## Minimum Context
ใช้ข้อมูลที่มี และระบุสิ่งที่ขาด:
- Test objective
- Method / instrument / procedure reference
- Sample / batch identity ที่จำเป็น
- Units
- Replicates
- QC / blank / control ถ้ามี
- Specification / acceptance criteria ถ้ามี

หากไม่มี spec ห้ามสร้างเกณฑ์ pass/fail เอง

## Review Checklist

### 1. Completeness
- Sample/batch ครบหรือไม่
- หน่วยชัดเจนและสอดคล้องหรือไม่
- มี missing / duplicated rows หรือไม่
- Method/version/date ระบุหรือไม่

### 2. Traceability
ผลลัพธ์ย้อนกลับไปยัง sample, run, instrument หรือ source record ได้หรือไม่

### 3. Quality Controls
ถ้ามี QC/control/blank:
- มีผลหรือไม่
- อยู่ในเกณฑ์ที่ **ผู้ใช้หรือ method ระบุ** หรือไม่
- หากเกณฑ์ไม่ถูกให้มา ให้ระบุ `รอยืนยันเกณฑ์ QC`

### 4. Replicate Consistency
ดูความสม่ำเสมอของ replicates และ flag ความแปรปรวนที่ควรตรวจเพิ่ม โดยไม่สร้าง threshold เอง

### 5. Outlier Review
Outlier เป็น **สัญญาณให้ตรวจ** ไม่ใช่เหตุผลให้ลบทันที

ระบุ:
- จุดที่ผิดปกติ
- เหตุผลที่สงสัย
- ต้องตรวจ raw data / instrument / sample handling อะไร

### 6. Calculation & Units
ตรวจสูตร การแปลงหน่วย significant figures และ denominator ที่เกี่ยวข้อง

### 7. Method / Spec Alignment
เทียบเฉพาะกับ method/spec/standard ที่ระบุหรือแหล่งล่าสุดที่ตรวจสอบได้

ห้ามอ้างว่า “ผ่าน ISO/ICH/USP/CLSI” เพียงเพราะตัวเลขดูสมเหตุผล

### 8. Interpretation Boundary
แยก:
- **Observed result**
- **Calculation**
- **Interpretation**
- **Decision / release**

สามอย่างแรกช่วยตรวจได้ ส่วน Decision/Release ต้องเป็นผู้มีอำนาจ/ผู้เชี่ยวชาญ

## Output เริ่มต้น

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
- Spec alignment: PASS / FAIL / CANNOT ASSESS *(ใช้ PASS/FAIL เฉพาะเมื่อมีเกณฑ์จริง)*

## Findings
| Finding | Evidence | Risk / impact | What to check next |
|---|---|---|---|

## Questions for qualified reviewer
1. …

## Human sign-off required
- Official result release: Yes
- Method acceptance / validation approval: Yes when applicable

## Guardrails
- ไม่สร้าง LOD/LOQ, acceptance criteria, reference range หรือ QC threshold ขึ้นเอง
- ไม่ลบ outlier โดยไม่มีเหตุผลและ traceable decision
- ไม่แต่ง replicate หรือ missing data
- หากข้อมูลเป็น clinical/patient data ให้หยุดและส่งไป workflow ที่เหมาะสมพร้อม privacy review
- ใช้ `evidence-before-approval` ก่อนกล่าวว่า report พร้อมออกอย่างเป็นทางการ

---

**Method note:** แนวทาง evidence-bounded analysis, method validation boundaries และ qualified review ได้แรงบันดาลใจจาก scientific-agent-skills ของ K-Dense-AI และเขียนใหม่สำหรับบริบทห้องปฏิบัติการ/โรงงานต้นแบบของ STeP
