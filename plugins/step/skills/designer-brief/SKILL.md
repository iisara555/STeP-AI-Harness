---
name: designer-brief
description: เปลี่ยนคำขอด้านการออกแบบของ STeP ให้เป็น Designer Brief ที่มีโครงสร้างพร้อมใช้งาน ตรวจข้อมูลและ Asset ที่จำเป็น แยก Timeline และเส้นทางการตัดสินใจ พร้อมจัดหมวดและข้อมูลให้สอดคล้องกับระบบ DS69 โดยไม่สร้างเลขงาน ผู้รับผิดชอบ กำหนดเวลา หรือการอนุมัติขึ้นเอง
standardVersion: 3
---

# Designer Brief

## Purpose

เปลี่ยนคำขอด้านการออกแบบที่กระจัดกระจายหรือข้อมูลยังไม่ครบให้เป็น **Designer Brief** ที่มีโครงสร้างชัดเจน (`Design Request → Structured & Validated Designer Brief`) พร้อมตรวจ Content, Asset และ Production Specification ก่อนส่งต่อให้ Designer

ไม่ใช่การอนุมัติงาน มอบหมาย Designer หรือสร้างเลข Job ID แทนระบบ

## เมื่อควรใช้

- มีคำขอออกแบบจากแชต อีเมล หรือประชุมที่ข้อมูลยังไม่เป็นระบบ
- ต้องเตรียมบรีฟก่อนส่งงานให้ Designer และแยก Deliverable ตามหมวดระบบ DS69
- ต้องตรวจว่า Content, Brand Asset, Timeline และผู้มีอำนาจอนุมัติครบก่อนเริ่มผลิตหรือยัง

**Anti-trigger:**
- ต้องการ Creative / Art Direction หรือ Visual Hammer → `creative-art-director`
- ตรวจชิ้นงานที่ทำเสร็จแล้วเทียบ Brand CI → `step-brand`
- วางคอนเซ็ปต์งาน Event นิทรรศการ หรือผังบูธ → `event-concept`
- ต้องการ Prompt Spec สร้างภาพ AI → `step-image-prompt`

## Inputs

- ข้อความขอออกแบบ, Meeting note, Email / Chat, Form submission, เอกสารโครงการ, Copy, Logo / Image / Reference, Production specification

## Source

- ข้อมูลทั้งหมดมาจาก **คำขอและ Asset ที่ผู้ใช้ให้มา** (แนวทางรายละเอียดและหมวด DS69 อยู่ที่ `references/brief-specification-guide.md`)
- อัตลักษณ์องค์กรอ้าง `step-brand` และ Asset ที่อนุมัติแล้ว; เลขงาน ผู้รับผิดชอบ และกำหนดเวลาต้องมาจากระบบจริง **ห้ามสร้างขึ้นเอง**
- แบบฟอร์มระบบคุณภาพที่ต้องยื่นจริงคือ **FM-CC-010** ดู [ทะเบียนเอกสารระบบคุณภาพ ทีม CC](../../docs/knowledge/cc-iso-document-register.md) · ดาวน์โหลดจาก **STeP : MIS** เท่านั้น ห้ามสร้างแบบฟอร์มขึ้นเอง และ **FM-CC-001 / FM-CC-003 / FM-CC-008 ยกเลิกแล้วตั้งแต่ 1 ก.ย. 2569**

## Workflow

ดำเนินงานตามกรอบใน `references/brief-specification-guide.md` และแม่แบบ `templates/designer-brief-template.md`:
1. **Extract Objective & Deliverables:** ดึงเป้าหมาย ผู้รับสาร Key message ช่องทาง ภาษา วันใช้งานจริง และขนาด/จำนวน/Format ของแต่ละ Deliverable (ห้ามเดา; ขาดให้เขียน `ยังไม่ระบุ`)
2. **Categorize (DS69):** จัดหมวดงานตาม DS69 (`Consult`, `Print`, `Digital`, `Info / Content`, `Video / Motion`, `Branding`, `Adaptation`, `Illustration / 3D`, `Event / Exhibition / Interior`) โดยแยก Deliverable หากมีหลายประเภท
3. **Audit Content & Assets:** แยกเป็น **ได้รับแล้ว** กับ **ยังขาด** (แยก Draft Copy ออกจาก Final Copy และไม่นับ Reference เป็น Final Spec อัตโนมัติ)
4. **Separate Timeline & Decision Path:** แยก 4 จุด (`Draft แรก`, `Review`, `Approval`, `ใช้งานจริง`) และ 4 บทบาท (`ผู้ให้ข้อมูล`, `ผู้ประสานงาน`, `ผู้ตัดสินใจ`, `ผู้อนุมัติ`) ห้ามถือว่าผู้ขอ = ผู้อนุมัติ
5. **Check Job ID & Validate 8 Gates:** รักษา `DS69-###-JobName-JobType` ถ้ามี หรือระบุ `Job ID: ยังไม่ได้สร้าง`; รวมรายการที่ขาดทั้งหมดลง `Missing Information`

## Output

แสดงผลตามแม่แบบ `templates/designer-brief-template.md`: `Brief Summary`, `Deliverables`, `Content & Assets`, `Timeline`, `Decision Path`, `Job Information`, `Missing Information`, และ `Production Considerations (เฉพาะเมื่อเกี่ยวข้อง — ติดป้าย ข้อควรพิจารณา)`
ดูตัวอย่างผลลัพธ์มาตรฐานได้ที่ `examples/good-designer-brief.md`

## Authority

- **AI ช่วยได้:** จัดโครงสร้างบรีฟ, จัดหมวด DS69 เบื้องต้น, ตรวจความครบของข้อมูล/Asset และชี้ Missing Information
- **ต้องให้มนุษย์ตัดสิน (`human-approval-rule`):**
  - การอนุมัติงานและการมอบหมาย Designer
  - การออกเลขงานในระบบ DS69 และการยื่นแบบฟอร์ม **FM-CC-010** ใน STeP : MIS
  - การยืนยันกำหนดส่ง (Draft/Review/Approval) และลำดับความสำคัญ

## Handoff

- ต้องการ Creative Direction / Visual Hammer → `creative-art-director`
- ตรวจชิ้นงานเทียบ Brand CI ก่อนเผยแพร่ → `step-brand`
- งาน Event หรือผังนิทรรศการ → `event-concept`
- ปรับถ้อยคำ/น้ำเสียงบนชิ้นงาน → `brand-tone-of-voice`

พร้อมส่งต่อเมื่อ: Deliverable, Content, Asset, Timeline และ Decision Path ระบุครบ หรือชี้ชัดว่ายังขาดอะไร

## Guardrails

- ห้ามสร้าง Job ID (`DS69-...`), ห้ามแต่ง Deadline และห้ามคำนวณ Timeline ย้อนหลังเองเว้นแต่ผู้ใช้ขอช่วยวางแผน
- ห้ามแต่ง Owner / Decision Maker / Approver และห้ามทึกทักว่าผู้ขอคือผู้อนุมัติ
- ห้ามถือว่า Reference คือ Final Direction หรือ Draft Copy คือ Final Copy โดยอัตโนมัติ
- ห้ามเปลี่ยนข้อมูลที่ยังไม่ยืนยันให้เป็นข้อเท็จจริง ให้คงชื่อโครงการ รหัส ตัวเลข และ Spec ตามต้นทาง

## Environment

- ใช้งานได้ทั้งใน STeP Desktop และ Claude plugin ร่วมกับ `references/brief-specification-guide.md`, `templates/designer-brief-template.md` และ `examples/good-designer-brief.md`
- ไม่ต้องใช้เครื่องมือภายนอกหรือรหัสลับ; หากมีข้อมูลติดต่อบุคคลในไฟล์บรีฟให้ผ่าน Privacy Gate ก่อนเสมอ

## Pitfalls

- เดาขนาดมาตรฐาน (เช่น 1080×1080) ใส่แทนขนาดจริงทั้งที่ผู้ขอไม่เคยระบุ → ต้องใส่ `ยังไม่ระบุ` และนำเข้า `Missing Information`
- ยัดงาน Print และ Digital ไว้ใน Deliverable เดียวแล้วลืมระบุสเปก CMYK/Bleed → ต้องแยกแถว Deliverable ตามหมวด DS69 เสมอ
- คาดเดาชื่อผู้อนุมัติจากชื่อผู้ส่งอีเมล → ต้องลงว่า `ยังไม่ระบุ` จนกว่าจะมีหลักฐานบทบาทจริง

## Verification

- ตรวจด้วย `node scripts/validate-repo.js` (Standard v3, ไม่มี emoji) และผ่าน `reviewPack()`
- ตรวจ routing 4 มิติใน `evals/skills/designer-brief.json` ผ่าน `npm test`
- ก่อนส่งเข้าคิวผลิตจริง ผู้ประสานงาน/ทีม CC ต้องกรอก **FM-CC-010** จาก STeP : MIS และยืนยันเลขงาน DS69 ในระบบ

## Maintenance

อัปเดตล่าสุด: 2026-11-25

- เจ้าของเนื้อหา: ทีม CC (`../../manifest/skills.yaml`, stage `pilot`)
- แก้ Skill นี้เมื่อหมวดงาน DS69, ทะเบียน `../../docs/knowledge/cc-iso-document-register.md`, หรือขั้นตอนรับบรีฟของทีม CC เปลี่ยน แล้วอัปเดตวันที่ข้างต้นทันที
