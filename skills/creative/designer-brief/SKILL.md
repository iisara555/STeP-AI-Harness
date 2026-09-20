---
name: designer-brief
description: เปลี่ยนคำขอด้านการออกแบบของ STeP ให้เป็น Designer Brief ที่มีโครงสร้างพร้อมใช้งาน ตรวจข้อมูลและ Asset ที่จำเป็น แยก Timeline และเส้นทางการตัดสินใจ พร้อมจัดหมวดและข้อมูลให้สอดคล้องกับระบบ DS69 โดยไม่สร้างเลขงาน ผู้รับผิดชอบ กำหนดเวลา หรือการอนุมัติขึ้นเอง
standardVersion: 2
---

# Designer Brief

## Purpose

เปลี่ยนคำขอด้านการออกแบบที่อาจกระจัดกระจายหรือข้อมูลไม่ครบ ให้เป็น Designer Brief ที่ชัดเจนและพร้อมส่งต่อให้ Designer

Skill นี้มีหน้าที่:

**Design Request → Structured & Validated Designer Brief**

ไม่ใช่การอนุมัติงาน มอบหมาย Designer หรือสร้าง Job ID แทนระบบ

## เมื่อควรใช้

- มีคำขอออกแบบที่ข้อมูลยังไม่ครบหรือกระจัดกระจาย
- ต้องเตรียมบรีฟก่อนส่งงานให้ Designer
- ต้องตรวจว่า content, asset และ specification พร้อมผลิตหรือยัง

**Anti-trigger:**
- ต้องการ creative direction หรือแนวทางภาพ → `creative-art-director`
- ตรวจงานที่ออกแบบเสร็จแล้วเทียบ brand → `step-brand`
- งาน event หรือนิทรรศการ → `event-concept`

## Inputs

อาจได้รับข้อมูลจาก:

* ข้อความขอออกแบบ
* Meeting note
* Email / Chat
* Form submission
* เอกสารโครงการ
* Content / Copy
* Logo / Image / Reference
* Production specification

## Source

- ข้อมูลทั้งหมดมาจาก **คำขอและ asset ที่ผู้ใช้ให้มา**
- อัตลักษณ์องค์กรอ้างอิง `step-brand` และ asset ที่ได้รับอนุมัติ
- เลขงาน ผู้รับผิดชอบ และกำหนดเวลา ต้องมาจากระบบงานจริง **ห้ามสร้างขึ้นเอง**

## Workflow

### 1. ระบุวัตถุประสงค์

ดึงข้อมูลเท่าที่มี:

* เป้าหมายของงาน
* ผู้รับสาร
* Key Message
* ช่องทางใช้งาน
* ภาษา
* วันที่ใช้งานจริง

หากไม่มีข้อมูลสำคัญ ให้ระบุว่า `ยังไม่ระบุ`

### 2. ระบุ Deliverables

สำหรับแต่ละ Deliverable ให้ดึงข้อมูลเท่าที่มี เช่น:

* ประเภทชิ้นงาน
* ขนาด
* จำนวน
* Format
* ช่องทาง
* Specification การผลิต

ห้ามสร้างขนาด จำนวน หรือ Specification จากการคาดเดา

### 3. จัดหมวดงาน

เลือกหมวดที่ตรงที่สุดจาก taxonomy ของระบบ DS69

เช่น:

* Consult
* Print
* Digital
* Info / Content
* Video / Motion
* Branding
* Adaptation
* Illustration / 3D
* Event / Exhibition / Interior

หากมี Subcategory ที่ยืนยันได้ ให้ระบุเพิ่มเติม

หากงานครอบคลุมหลายประเภท ให้ระบุ Deliverable แยกกันแทนการบังคับให้อยู่ในหมวดเดียว

### 4. ตรวจ Content และ Asset

ตรวจว่ามีหรือยัง:

* Final / Draft Copy
* Logo
* Brand Asset
* รูปภาพ
* Reference
* ข้อมูลผลิตภัณฑ์หรือโครงการ
* Specification
* Production requirement
* ไฟล์ต้นฉบับที่เกี่ยวข้อง

แยกเป็น:

**ได้รับแล้ว**
และ
**ยังขาด**

ห้ามถือว่า Reference คือข้อกำหนดที่ต้องทำตามทั้งหมด เว้นแต่ผู้ใช้ระบุชัดเจน

### 5. แยก Timeline

แยกวันที่ตามความหมาย ไม่รวมเป็น Deadline เดียว:

| Milestone  | วันที่ |
| ---------- | ------ |
| Draft แรก  |        |
| Review     |        |
| Approval   |        |
| ใช้งานจริง |        |

แสดงเฉพาะวันที่ที่มีข้อมูล

หากวันที่ใดไม่มี ให้ใช้ `ยังไม่ระบุ`

ห้ามคำนวณ Draft หรือ Review date ย้อนกลับจากวันใช้งานเอง เว้นแต่ผู้ใช้ขอให้ช่วยวาง Timeline

### 6. ระบุ Decision Path

แยกบทบาทที่พบในต้นทาง เช่น:

* ผู้ให้ข้อมูล
* ผู้ประสานงาน
* ผู้ตัดสินใจ
* ผู้อนุมัติ

บุคคลหนึ่งอาจมีมากกว่าหนึ่งบทบาทได้เมื่อมีหลักฐาน

ห้ามถือว่า:

`ผู้ขอ = ผู้อนุมัติ`

หรือ

`ผู้ประสานงาน = ผู้ตัดสินใจ`

โดยอัตโนมัติ

### 7. Job Identification

หากมี Job ID ที่ยืนยันแล้ว ให้รักษาเลขเดิม

รูปแบบชื่อ:

`DS69-###-JobName-JobType`

หากยังไม่มี Job ID:

`Job ID: ยังไม่ได้สร้าง`

ห้ามสร้างเลข DS69 ใหม่เอง

## Validation

ก่อนส่ง Brief ให้ตรวจอย่างน้อย:

* วัตถุประสงค์ชัดหรือไม่
* ผู้รับสารมีหรือไม่
* Deliverable ระบุหรือไม่
* Content พร้อมหรือยัง
* Asset พร้อมหรือยัง
* วันใช้งานจริงมีหรือไม่
* ผู้ตัดสินใจหรือผู้อนุมัติระบุหรือไม่
* มีข้อจำกัดด้านการผลิตหรือไม่

ข้อมูลที่ขาดไม่ใช่เหตุผลให้เติมเอง

ให้แสดงเป็น Missing Information

## Output

### Brief Summary

สรุปสั้น ๆ ว่า:

* งานคืออะไร
* ทำเพื่ออะไร
* สำหรับใคร
* จะนำไปใช้งานที่ไหนหรือเมื่อใด

### Deliverables

| Deliverable | Category | Size / Format | Quantity | Channel |
| ----------- | -------- | ------------- | -------- | ------- |

### Content & Assets

**ได้รับแล้ว**

* ...

**ยังขาด**

* ...

### Timeline

| Milestone  | Date | Status |
| ---------- | ---- | ------ |
| Draft แรก  |      |        |
| Review     |      |        |
| Approval   |      |        |
| ใช้งานจริง |      |        |

### Decision Path

| Role         | Person / Team |
| ------------ | ------------- |
| ผู้ให้ข้อมูล |               |
| ผู้ประสานงาน |               |
| ผู้ตัดสินใจ  |               |
| ผู้อนุมัติ   |               |

### Job Information

* Job ID:
* Job Name:
* Category:
* Subcategory:

### Missing Information

ระบุเฉพาะข้อมูลที่จำเป็นต่อการเริ่มหรือดำเนินงาน เช่น:

* Copy ยังไม่ครบ
* ยังไม่มีขนาดงาน
* ยังไม่ทราบวันใช้งานจริง
* ยังไม่ระบุผู้ตัดสินใจ

### Production Considerations

แสดงเฉพาะเมื่อเกี่ยวข้อง เช่น:

* Resolution
* Bleed / Safe area
* Material
* Print process
* Installation
* Venue limitation
* Export format

หากเป็นข้อสังเกตที่ AI วิเคราะห์เพิ่มเติม ให้ระบุว่าเป็น `ข้อควรพิจารณา` ไม่ใช่ข้อเท็จจริงจากต้นทาง

## Authority

AI ช่วยได้: จัดโครงสร้างบรีฟ ตรวจความครบของข้อมูลและ asset และระบุสิ่งที่ยังขาด

ต้องให้มนุษย์ตัดสิน:
- การอนุมัติงานและการมอบหมาย Designer
- การออกเลขงานในระบบ
- การยืนยันกำหนดส่งและลำดับความสำคัญ

## Handoff

- ต้องการแนวทางภาพและ creative direction → `creative-art-director`
- ตรวจงานเทียบ brand ก่อนเผยแพร่ → `step-brand`
- งาน event หรือนิทรรศการ → `event-concept`
- ข้อความบนชิ้นงาน → `brand-tone-of-voice`

พร้อมส่งต่อเมื่อ: deliverable, content, asset, timeline และเส้นทางการตัดสินใจครบ หรือระบุไว้ชัดว่ายังขาดอะไร

## Guardrails

* ห้ามสร้าง Job ID
* ห้ามแต่ง Deadline
* ห้ามแต่ง Owner หรือ Approver
* ห้ามถือว่า Reference คือ Final Direction โดยอัตโนมัติ
* ห้ามถือว่า Draft Copy คือ Final Copy
* ห้ามถือว่างานพร้อมผลิตเพียงเพราะ Artwork เสร็จ
* ห้ามเปลี่ยนข้อมูลที่ยังไม่ยืนยันให้เป็นข้อเท็จจริง
* รักษาชื่อโครงการ รหัส วันที่ ตัวเลข และ Specification ตามต้นทาง
* หากข้อมูลไม่ครบ ให้แสดง Missing Information แทนการเดา
