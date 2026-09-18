# TOR → Project Plan Specification

เอกสารนี้เป็นมาตรฐานของ Playbook `tor-to-project-plan` สำหรับแปลง TOR ที่ STeP ได้รับงานแล้วให้เป็น Action Plan / WBS และ Gantt-ready spreadsheet

## 1. One TOR = One Run

- TOR แต่ละฉบับต้องสร้าง Playbook Run แยกกัน
- ห้ามรวม TOR หลายฉบับเป็น Project เดียวอัตโนมัติ แม้แนบมาในข้อความเดียวกัน
- ถ้ามีหลาย TOR ให้ถามหรือแยกเป็นหลาย Run โดยใช้ชื่อโครงการ/ชื่อไฟล์กำกับ
- การรวมหลาย TOR ทำได้เฉพาะเมื่อผู้ใช้สั่งชัดเจนว่าเป็นโครงการเดียวกันและต้องการ Master Portfolio Plan

## 2. TOR Fact vs Planning Assumption

ข้อมูลทุกจุดต้องแยกเป็น 2 กลุ่ม

### TOR Fact
ข้อมูลที่มีหลักฐานอยู่ใน TOR/สัญญา/เอกสารแนบ เช่น:
- วันจัดงาน
- ระยะเวลาสัญญา
- จำนวนกิจกรรม/บูธ/ชิ้นงาน
- Deliverable
- เงื่อนไขอนุมัติ/ตรวจรับ
- วงเงินรวม หรือราคาที่ระบุเป็นรายการ
- ข้อกำหนดด้านสถานที่/บุคลากร/ความปลอดภัย

### Planning Assumption
ข้อมูลที่ AI เสนอเพื่อให้บริหารโครงการได้ เช่น:
- ควรเริ่มออกแบบก่อนงาน 60 วัน
- ควรปิด supplier ก่อนงาน 30 วัน
- ระยะเวลาผลิตที่ TOR ไม่ได้ระบุ
- owner ที่ผู้ใช้ยังไม่ได้แต่งตั้ง

Planning Assumption ต้องติดป้ายชัดเจนและแก้ไขได้ ห้ามเขียนเหมือนเป็นข้อกำหนดจาก TOR

## 3. Project Parameters

สร้าง Parameter Block ก่อนแตก Gantt:

| Parameter | Rule |
| --- | --- |
| Contract Start | ใช้วันลงนามจริง ถ้าไม่ทราบให้เป็น TBD |
| Event Start | ใช้วันที่ TOR กำหนด ถ้ามี |
| Event End | ใช้วันที่ TOR กำหนด ถ้ามี |
| Contract End | ใช้วันที่ TOR/สัญญาระบุ หรือ derive จาก Contract Start ตามระยะเวลาที่ TOR กำหนด โดยติดป้าย Derived |

ถ้า Contract Start ยังไม่ทราบ แต่ Event Start ทราบ สามารถทำ Working Plan แบบ relative เช่น `E-60`, `E-30`, `E0`, `E+5` โดยระบุว่าเป็น Planning Assumption

## 4. Budget Guard

- ถ้า TOR มีเพียงวงเงินรวม ให้บันทึกเป็น **Total Budget Fact** เท่านั้น
- ห้าม AI กระจายวงเงินรวมเป็นงบรายกิจกรรมเอง
- ให้สร้างเฉพาะ `Budget Category` เพื่อเตรียมโครงงบ
- `Budget Amount` ใส่ได้เฉพาะเมื่อมีตัวเลขจาก TOR, BOQ, ใบเสนอราคา, งบ Bid หรือผู้ใช้ให้มา
- ทุกตัวเลขต้องระบุ `Budget Basis`: TOR / Bid / Quote / User Input / Planning Assumption
- Planning Assumption ด้านงบห้ามถูกนำเสนอเป็นงบอนุมัติหรือราคาจริง

## 5. WBS / Action Plan Rules

แตก TOR เป็นงานที่บริหารได้ โดยแต่ละแถวควรมี:
- WBS
- Activity
- TOR Ref.
- Workstream
- Owner
- Start Date
- End Date
- Date Basis: TOR Fact / Derived / Planning Assumption
- Duration
- Dependency
- Milestone
- Deliverable
- Approval Required
- Budget Category
- Budget Amount (Source Only)
- Budget Basis
- Status
- % Progress
- Remark

หลักการแตกงาน:
1. TOR heading/subheading เป็น traceability anchor ไม่จำเป็นต้องเท่ากับหนึ่ง task เสมอ
2. หนึ่ง task ต้องมีผลลัพธ์หรือจุดจบที่ตรวจได้
3. Approval/ความเห็นชอบจากผู้ว่าจ้างต้องแยกเป็น milestone/gate
4. งานติดตั้ง งานจัดงาน งานรื้อถอน และงานสรุปผลต้องมี dependency ต่อกัน
5. ห้ามสร้าง owner เป็นชื่อบุคคลถ้ายังไม่มีข้อมูล ให้ใช้ Role/Team หรือ TBD

## 6. Google Sheet / XLSX Output

สร้างอย่างน้อย 3 tabs:

### Project Parameters
เก็บ Contract Start / Event Start / Event End / Contract End / Total Budget Fact / Source Document

### Project Master Plan
ใช้ column schema ตามข้อ 5

### Gantt
- ดึงจาก Start/End ของ Project Master Plan
- แสดง Milestone และ Approval Gate ให้ต่างจาก task ปกติ
- ถ้าวันยังไม่ยืนยัน ให้ใช้ relative timeline หรือ TBD และอย่าทำให้ดูเหมือนวันจริง
- เปลี่ยน parameter แล้ว Timeline ควรปรับตามได้เมื่อ tool รองรับ formula

ถ้า Google Sheets connector/tool พร้อม ให้สร้างใน Google Sheet
ถ้าไม่มี ให้สร้าง XLSX ตาม schema เดียวกัน

## 7. Source Traceability

ทุกกิจกรรมที่มาจาก TOR ต้องมี `TOR Ref.` เช่น `6.4.1`, `6.10.9` หรือหน้าที่เกี่ยวข้อง

ถ้าเป็น Planning Assumption ให้ใส่ TOR Ref. เป็น `ASSUMPTION` หรืออ้าง requirement ที่ทำให้เกิด assumption

## 8. Human / Authority Boundary

Playbook ช่วยวางแผนและจัดโครงสร้าง แต่ไม่:
- อนุมัติงบ
- เลือกผู้ชนะ/ผู้รับจ้าง
- ยืนยันการตรวจรับ
- แก้ TOR/สัญญาอย่างเป็นทางการ
- รับรองว่าการดำเนินงานครบถ้วนแทนคณะกรรมการ

## 9. Acceptance Criteria

ถือว่า output พร้อมใช้งานเมื่อ:
- TOR Fact และ Planning Assumption แยกชัด
- ไม่มี TOR หลายฉบับถูก merge โดยไม่ได้รับคำสั่ง
- Activities trace กลับไป TOR ได้
- มี WBS / Dependency / Milestone / Approval Gate / Deliverable
- วันที่มี Basis
- งบไม่ถูกแต่งหรือกระจายเอง
- พร้อมลง Project Master Plan + Gantt
- missing information ถูกแสดงเป็น TBD/Gap แทนการเดา


## 10. Spreadsheet Action Contract

การสร้าง Google Sheet/XLSX ต้องทำตาม `docs/spreadsheet-project-plan.md`

หลักสำคัญ:
- Google Sheets เป็น preferred tool
- XLSX เป็น fallback
- ถ้าไม่มี tool เขียนไฟล์ ให้สถานะ Action เป็น `waiting-tool` แทนการอ้างว่าสร้างสำเร็จ
- Completion ต้องมี output reference/link/path จริง
- Sheet ต้องมีอย่างน้อย Project Parameters / Project Master Plan / Gantt
