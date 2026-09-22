# Spreadsheet Run of Show Action Contract

ใช้กับ action `spreadsheet-run-of-show` ของ Playbook `brief-to-run-of-show`

เป้าหมายคือทำให้ผลจาก Skill `event-run-of-show` กลายเป็น **ชีตที่ทีมเปิดใช้บนหน้างานได้จริง** หรือ XLSX fallback โดยไม่แต่งเวลา ชื่อ หรือรหัสฉากขึ้นเอง

## 1. Tool Resolution

1. ถ้ามี capability `google-sheets` หรือเครื่องมือเขียน Google Sheets ที่เทียบเท่า ให้สร้าง Google Sheet
2. ถ้าไม่มี ให้สร้าง XLSX ตาม schema เดียวกัน
3. ถ้าทั้งสองแบบทำไม่ได้ ให้หยุดที่ Action step ส่งมอบตารางแบบ structured แล้วแจ้งว่า `waiting-tool`

ห้ามบอกว่าสร้างชีตสำเร็จจนกว่าจะได้ file/sheet reference หรือ link จาก tool จริง

## 2. Create vs Update Safety

- ถ้าผู้ใช้ขอ **สร้างใหม่** ให้สร้างไฟล์ใหม่
- ถ้าผู้ใช้ขอ **แก้ชีตเดิม** ต้องมี Sheet/File reference ที่ระบุชัดเจนก่อน
- ห้ามเดาว่าชีตไหนเป็นของงานนี้จากชื่อที่คล้ายกัน เพราะงาน event มักมีไฟล์ชื่อซ้ำกันหลายปี
- **กฎวันงาน:** ถ้าเป็นวันงานจริงและทีมกำลังเปิดชีตนี้ใช้อยู่ ห้ามปรับโครงสร้าง ลบคอลัมน์ หรือเรียงแถวใหม่ ให้สร้าง tab เวอร์ชันใหม่แทนเสมอ ตารางที่คนกำลังอ่านบนหน้างานเป็นเอกสารปฏิบัติการ ไม่ใช่ร่าง
- การสร้างหรือแก้ชีตต้องไม่ข้าม Human Authority ของลำดับพิธีการ คำกล่าว และการจัดจ้าง

## 3. Required Tabs

### Tab 1 — Show Parameters

| Parameter | Value | Basis | Remark |
| --- | --- | --- | --- |
| Event Name | | SOURCE_FACT / USER_INPUT | |
| Date(s) | | SOURCE_FACT | |
| Venue | | SOURCE_FACT | |
| Room | | SOURCE_FACT | |
| Expected Pax | | SOURCE_FACT / รอยืนยัน | |
| Doors Open | | SOURCE_FACT | |
| Hard Stop | | SOURCE_FACT | |
| Show Caller | | USER_INPUT / รอยืนยัน | |
| MC | | USER_INPUT / รอยืนยัน | |
| AV Lead | | USER_INPUT / รอยืนยัน | |
| Source Document | | SOURCE_FACT | |
| Version | | ORGANIZATION_RULE | |
| Timezone | | ORGANIZATION_RULE | |
| Lane ที่ไม่ใช้ในงานนี้ | | ORGANIZATION_RULE | |

`Basis` ต้องเป็นหนึ่งใน `SOURCE_FACT`, `DERIVED_FACT`, `USER_INPUT`, `PLANNING_ASSUMPTION` ค่าที่ยังไม่มีให้เขียน `รอยืนยัน` ห้ามเว้นว่าง

### Tab 2 — Run of Show

ใช้ column ตามลำดับนี้ และตัดคอลัมน์ที่งานนี้ไม่ใช้ออก:

1. Day
2. Date
3. Block No.
4. Block
5. Block Time
6. Block Duration (นาที)
7. Cue No.
8. Cue Time
9. Cue Duration (นาที)
10. Timer (นาที)
11. Cue
12. Format / Scene
13. Screen L
14. Screen Main
15. Screen R
16. Monitor
17. Sound
18. Light
19. Facilities (ของที่ต้องมี)
20. Set Change (สิ่งที่ต้องทำ)
21. Asset Link
22. Lead
23. Support
24. Zone / Room
25. Status
26. Provenance
27. Remark / Checklist

กติกา:
- เปิด Filter ที่ header
- Freeze header row และ freeze คอลัมน์ 1 ถึง 8 เพื่อให้แกนเวลาค้างอยู่ขณะเลื่อนดู lane ด้านขวา
- `Status` ใช้ค่ามาตรฐาน: ยืนยันแล้ว / รอยืนยัน / ร่าง / ยกเลิก
- `Provenance` ใช้ได้เฉพาะ 6 label มาตรฐาน
- ทุกแถวถือค่า `Block` ของตัวเอง **ห้าม merge cell และห้ามใช้ช่องว่างแทนคำว่าเหมือนแถวบน**
- หนึ่งแถวคือหนึ่ง action
- `Lead` ว่างไม่ได้ ถ้ายังไม่รู้ตัวบุคคลให้ใส่บทบาทและตั้ง `Status = รอยืนยัน`
- `Support` ใช้รูปแบบ `ชื่อ : งานย่อย` บรรทัดละคน
- คอลัมน์ที่ไม่มีค่าเลยสักแถว ให้ลบออกจาก tab แล้วบันทึกไว้ที่ Show Parameters ว่า `ไม่ใช้ในงานนี้`

### Tab 3 — Cue Enums

| Code | ความหมายที่เสนอ | ใช้กับ lane | Status | ยืนยันโดย | ยืนยันเมื่อ |
| --- | --- | --- | --- | --- | --- |

รหัส Scene/Format ค่าที่ขึ้นจอ และตัวย่อชื่อคน เริ่มต้นที่ `รอยืนยัน` ทุกแถว ห้ามใช้รหัสใน Tab 2 จนกว่า `ยืนยันโดย` จะมีชื่อจริง

### Tab 4 — Open Items

| # | กฎที่ตรวจพบ | ความรุนแรง | คิว | สิ่งที่พบ | ต้องให้ใครยืนยัน | ภายในวันที่ | สถานะ |
| --- | --- | --- | --- | --- | --- | --- | --- |

## 4. Time and Timer Rules

- เวลาทุกค่าเป็นแบบ 24 ชั่วโมง `HH:MM` ช่วงเวลาใช้ `HH:MM–HH:MM`
- `Cue Duration` คำนวณจาก `Cue Time` และติดป้าย `DERIVED_FACT`
- `Timer` ต้องไม่เกิน `Cue Duration` ถ้าตั้งใจให้สั้นกว่าเพื่อกันเวลาผู้พูด ต้องเขียนเหตุผลใน `Remark`
- ทุก `Cue Time` ต้องอยู่ในกรอบ `Block Time`
- ผลรวม `Cue Duration` ที่ไม่ตรงกับ `Block Duration` ให้บันทึกที่ Open Items **ห้ามแก้ `Block Duration` ที่ต้นทางระบุเงียบ ๆ**
- วันที่แบบ พ.ศ. ให้แปลงเป็น `YYYY-MM-DD` แล้วเก็บค่าเดิมไว้ใน `Remark`

## 5. Provenance Rules

| ค่า | label |
| --- | --- |
| เวลา ชื่อ ตำแหน่ง สถานที่ ที่ยืนยันแล้วจากต้นทาง | `SOURCE_FACT` |
| `Cue Duration` และผลรวมที่คำนวณได้ | `DERIVED_FACT` |
| ค่าที่ผู้ใช้พิมพ์บอกในแชท | `USER_INPUT` |
| การแตกคิวที่เสนอ บทเชื่อมของพิธีกร เวลาที่เสนอ คิวสำรอง | `PLANNING_ASSUMPTION` |
| กติกาว่าทุกคิวต้องมี Lead, enum `Status`, และ naming convention | `ORGANIZATION_RULE` |
| ความหมายรหัส Scene ที่เสนอ และช่วงเวลาซ้อมที่แนะนำ | `AI_RECOMMENDATION` |

6 label นี้ปิดตายตาม `manifest/provenance.yaml` ห้ามเพิ่ม label ที่เจ็ด

## 6. Privacy Rules

- ห้ามเขียนเบอร์โทร ทะเบียนรถ เลขบัตรประชาชน เลขเที่ยวบิน หรือเวลาเดินทางของบุคคลลงในชีต
- `Lead` และ `Support` เก็บได้เฉพาะชื่อหรือบทบาท
- ข้อมูลติดต่อของทีมงานและคนขับรถ อยู่ในรายชื่อที่คุมสิทธิ์แยกต่างหาก ชีตอ้างถึงด้วยชื่อหรือบทบาทเท่านั้น
- ก่อนอ่านไฟล์แนบให้ใช้ Privacy Gate ตาม [Privacy preflight](privacy-preflight.md)

## 7. Completion Contract

Action ถือว่า `completed` เมื่อมีอย่างใดอย่างหนึ่ง:

### Google Sheets
- ได้ Sheet/File reference หรือ URL จาก tool เป็น HTTPS แบบ canonical ไม่มี credential, query หรือ fragment
- มี 4 tabs ครบ
- schema ผ่าน
- run state บันทึก output reference

### XLSX fallback
- ได้ path ของไฟล์ XLSX จริงที่อยู่ภายใน `output` ของ workspace และไฟล์ไม่ว่าง
- มี 4 sheets ครบ
- schema ผ่าน
- run state บันทึก output path

ถ้าไม่มี tool ทำไฟล์:
- Action = `waiting-tool`
- เก็บตาราง structured ไว้
- ห้ามย้อนกลับไปทำ Skill steps ใหม่โดยไม่จำเป็น

## 8. Suggested File Name

`YYYYMMDD_TEAM_spreadsheet_RunOfShow-<Event>-D<N>_vNN`

ตัวอย่าง: `20260523_CC_spreadsheet_RunOfShow-Exec-Seminar-D1_v01`

ใช้ Output Manager ของ STeP AI เมื่อเป็น XLSX และไม่เขียนทับไฟล์เดิม
