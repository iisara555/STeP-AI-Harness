# Spreadsheet Project Plan Action Contract

ใช้กับ action `spreadsheet-project-plan` ของ Playbook `tor-to-project-plan`

เป้าหมายคือทำให้ผลจาก Action Plan กลายเป็น **Google Sheet ที่ใช้งานต่อได้จริง** หรือ XLSX fallback โดยไม่แต่งข้อมูลจาก TOR

## 1. Tool Resolution

ลำดับการเลือกเครื่องมือ:

1. ถ้ามี capability `google-sheets` หรือเครื่องมือเขียน Google Sheets ที่เทียบเท่า → สร้าง Google Sheet
2. ถ้าไม่มี → สร้าง XLSX ตาม schema เดียวกัน
3. ถ้าทั้งสองแบบทำไม่ได้ → หยุดที่ Action step และส่งมอบ structured table พร้อมแจ้งว่า `waiting-tool`

ห้ามบอกว่าสร้าง Google Sheet สำเร็จจนกว่าจะได้ file/sheet reference หรือ link จาก tool จริง

## 2. Create vs Update Safety

- ถ้าผู้ใช้ขอ **สร้างใหม่** ให้สร้างไฟล์ใหม่
- ถ้าผู้ใช้ขอ **แก้ Sheet เดิม** ต้องมี Sheet/File reference ที่ระบุชัดเจนก่อน
- ห้ามเดาว่า Google Sheet ไหนเป็นของโครงการจากชื่อคล้ายกัน
- ห้าม overwrite Sheet/Tab เดิมโดยไม่จำเป็น ให้สร้าง tab ใหม่หรือ version ใหม่เมื่อไม่แน่ใจ
- การสร้าง/แก้ Sheet ต้องไม่ข้าม Human Authority ของ TOR, งบประมาณ, การอนุมัติ หรือการตรวจรับ

## 3. Required Tabs

### Tab 1 — Project Parameters

อย่างน้อยต้องมี:

| Parameter | Value | Basis | Source/Remark |
| --- | --- | --- | --- |
| Contract Start | date / TBD | TOR Fact / User Input | |
| Event Start | date / TBD | TOR Fact / User Input | |
| Event End | date / TBD | TOR Fact / User Input | |
| Contract End | date / TBD | TOR Fact / Derived | |
| Total Budget Fact | amount / TBD | TOR / Bid / User Input | |
| Source Document | filename/ref | Source | |

Derived value ต้องติดป้าย `Derived` และ Planning Assumption ต้องไม่ถูกแสดงเป็น TOR Fact

### Tab 2 — Project Master Plan

ใช้ column ตามลำดับนี้:

1. WBS
2. Activity
3. TOR Ref.
4. Workstream
5. Owner
6. Start Date
7. End Date
8. Date Basis
9. Duration
10. Dependency
11. Milestone
12. Deliverable
13. Approval Required
14. Budget Category
15. Budget Amount
16. Budget Basis
17. Status
18. % Progress
19. Remark

กติกา:
- เปิด Filter ที่ header
- Freeze header row
- `Status` ใช้ค่ามาตรฐาน: Not Started / In Progress / Waiting / Done / Blocked
- `% Progress` เป็น 0–100
- ถ้าไม่มี Owner จริง ใช้ Role/Team หรือ TBD
- `Budget Amount` เว้นว่างถ้า source ไม่ได้ระบุ
- Activity ที่ AI เสนอเองต้องมี `Date Basis = Planning Assumption` หรือ remark ที่ชัดเจน

### Tab 3 — Gantt

Gantt ต้องอ่านจาก Project Master Plan ไม่ duplicate source of truth

- ใช้ Start/End Date เป็นฐาน
- Milestone และ Approval Gate ต้องมองเห็นแยกจาก task ปกติ
- Timeline scale:
  - โครงการ ≤ 90 วัน: รายวันหรือรายสัปดาห์
  - โครงการ > 90 วัน: รายสัปดาห์เป็น default
- ถ้ามี relative timeline เช่น `E-60` แต่ยังไม่มีวันจริง ให้คง relative representation ไว้ ห้ามแปลงเป็นวันที่จริงเอง
- เมื่อ Project Parameters เปลี่ยน และ tool รองรับ formula ให้ timeline ที่ Derived ปรับตาม parameter

## 4. Gantt Data Rules

- TOR date → `Date Basis = TOR Fact`
- วันที่คำนวณจาก Contract/Event parameter → `Date Basis = Derived`
- วันที่ AI เสนอเพื่อบริหารงาน → `Date Basis = Planning Assumption`
- Missing date → TBD
- Dependency ต้องอ้าง WBS หรือ Milestone ที่ตรวจสอบได้
- ห้ามขยาย/ลดระยะเวลาสัญญาเป็นข้อเท็จจริงเอง

## 5. Budget Rules

- วงเงินรวมจาก TOR เก็บใน Project Parameters
- ห้ามกระจายวงเงินรวมเข้ากิจกรรมโดย AI
- ใช้ `Budget Category` เพื่อเตรียมโครงสร้างเท่านั้น
- ใส่ `Budget Amount` เมื่อมี source: TOR / Bid / BOQ / Quote / User Input
- ทุกจำนวนเงินต้องมี `Budget Basis`

## 6. Completion Contract

Action ถือว่า `completed` เมื่อมีอย่างใดอย่างหนึ่ง:

### Google Sheets
- ได้ Sheet/File reference หรือ URL จาก tool
- มี 3 tabs ครบ
- schema ผ่าน
- run state บันทึก output reference

### XLSX fallback
- ได้ path ของไฟล์ XLSX จริง
- มี 3 sheets ครบ
- schema ผ่าน
- run state บันทึก output path

ถ้าไม่มี tool ทำไฟล์:
- Action = `waiting-tool`
- เก็บ structured plan ไว้
- ห้ามย้อนกลับไปทำ Skill steps ใหม่โดยไม่จำเป็น

## 7. Suggested File Name

`YYYYMMDD_TEAM_spreadsheet_<Project-Name>_vNN`

ใช้ Output Manager ของ STeP AI เมื่อเป็น XLSX และไม่เขียนทับไฟล์เดิม
