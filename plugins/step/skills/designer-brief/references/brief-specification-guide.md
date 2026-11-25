# Brief Specification Guide — DS69 Taxonomy, Asset & Validation

คู่มือประกอบสำหรับ `designer-brief` เพื่อแยกประเภทงานตามระบบ DS69 ตรวจ Asset ที่พร้อมและขาด และตรวจสอบเส้นทางการตัดสินใจโดยไม่สร้าง Job ID หรือ Timeline เอง

---

## 1. หมวดงานในระบบ DS69 (เลือกตาม Deliverable จริง)

- `Consult`
- `Print`
- `Digital`
- `Info / Content`
- `Video / Motion`
- `Branding`
- `Adaptation`
- `Illustration / 3D`
- `Event / Exhibition / Interior`

*(หากงานมีหลายชิ้นคนละประเภท ให้แยก Deliverable แต่ละรายการแทนการฝืนรวมไว้หมวดเดียว และระบุ Subcategory เฉพาะเมื่อยืนยันได้)*

---

## 2. รายการตรวจ Content & Assets

แยกเป็น **ได้รับแล้ว** และ **ยังขาด** โดยครอบคลุม:
- Final / Draft Copy (`ห้ามถือว่า Draft Copy คือ Final Copy`)
- Logo & Official Brand Asset (จาก STeP / พันธมิตรที่อนุมัติแล้ว)
- รูปภาพ & Reference (`ห้ามถือว่า Reference คือข้อกำหนดทั้งหมดเว้นแต่ผู้ใช้ระบุชัด`)
- ข้อมูลผลิตภัณฑ์หรือโครงการ, Specification การผลิต, ไฟล์ต้นฉบับ (เช่น `.ai`, `.psd`)

---

## 3. กติกา Timeline, Decision Path และ Job ID

- **Timeline (แยก 4 จุดสำคัญ ไม่รวมเป็น Deadline เดียว):** `Draft แรก` / `Review` / `Approval` / `ใช้งานจริง`
  - แสดงเฉพาะวันที่ที่มีข้อมูลจริง ช่องที่ไม่มีเขียน `ยังไม่ระบุ`
  - ห้ามคำนวณย้อนหลังจากวันใช้งานจริง เว้นแต่ผู้ใช้ขอให้ช่วยวางแผนเทียบวัน
- **Decision Path (4 บทบาท):** `ผู้ให้ข้อมูล` · `ผู้ประสานงาน` · `ผู้ตัดสินใจ` · `ผู้อนุมัติ`
  - ห้ามถือว่า `ผู้ขอ = ผู้อนุมัติ` หรือ `ผู้ประสานงาน = ผู้ตัดสินใจ` โดยอัตโนมัติ (ถือบทบาทซ้ำได้ต่อเมื่อมีหลักฐาน)
- **Job Identification:** รักษาเลข `DS69-###-JobName-JobType` ถ้ามีอยู่แล้ว; หากไม่มีให้ระบุ `Job ID: ยังไม่ได้สร้าง` (**ห้ามสร้างเลข DS69 ใหม่เอง**)

---

## 4. Production Considerations & Validation Gate

- **Production Specs (แสดงเฉพาะเมื่อเกี่ยวข้อง):** Resolution, Bleed / Safe area, Material, Print process, Installation, Venue limitation, Export format *(ข้อสังเกตที่ AI วิเคราะห์เพิ่มต้องระบุว่า `ข้อควรพิจารณา`)*
- **Validation ก่อนส่งบรีฟ 8 ข้อ:** 1) วัตถุประสงค์ชัด 2) ผู้รับสาร 3) Deliverable 4) Content 5) Asset 6) วันใช้งานจริง 7) ผู้ตัดสินใจ/ผู้อนุมัติ 8) ข้อจำกัดผลิต — จุดที่ขาดต้องลงใน `Missing Information`
