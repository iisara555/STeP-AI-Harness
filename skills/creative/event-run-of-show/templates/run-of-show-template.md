# แม่แบบ Run of Show

คัดลอกตารางนี้แล้วลบ lane ที่งานนี้ไม่ใช้ออก อย่าเก็บคอลัมน์ว่างไว้

ชื่อและค่าที่ปรากฏด้านล่างเป็นตัวอย่างสมมติ ไม่ใช่ข้อมูลของงานจริง

## Show Parameters

| Parameter | Value | Basis | Remark |
| --- | --- | --- | --- |
| Event Name | | SOURCE_FACT / USER_INPUT | |
| Date(s) | | SOURCE_FACT | |
| Venue | | SOURCE_FACT | |
| Room | | SOURCE_FACT | |
| Expected Pax | | SOURCE_FACT / รอยืนยัน | |
| Doors Open | | SOURCE_FACT | |
| Hard Stop | | SOURCE_FACT | เวลาที่ต้องจบแน่นอน |
| Show Caller | | USER_INPUT / รอยืนยัน | |
| MC | | USER_INPUT / รอยืนยัน | |
| AV Lead | | USER_INPUT / รอยืนยัน | |
| Source Document | | SOURCE_FACT | ไฟล์ต้นทางที่ใช้ทำตารางนี้ |
| Version | v01 | ORGANIZATION_RULE | |
| Lane ที่ไม่ใช้ในงานนี้ | | ORGANIZATION_RULE | ระบุให้ชัดว่าลบคอลัมน์ไหนออกไปเพราะอะไร |

## Run of Show

| Day | Date | Block No. | Block | Block Time | Block Duration (นาที) | Cue No. | Cue Time | Cue Duration (นาที) | Timer (นาที) | Cue | Format / Scene | Screen L | Screen Main | Screen R | Monitor | Sound | Light | Facilities (ของที่ต้องมี) | Set Change (สิ่งที่ต้องทำ) | Asset Link | Lead | Support | Zone / Room | Status | Provenance | Remark / Checklist |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Day 1 | 2026-05-23 | 2 | พิธีเปิด | 08:30–08:40 | 10 | | | | | | | | | | | | | | | | | | | | | แถวหัวข้อวาระ ถือเวลารวมของ block |
| Day 1 | 2026-05-23 | 2 | พิธีเปิด | 08:30–08:40 | 10 | B02-C01 | 08:33–08:35 | 2 | | MC ขึ้นเวที กล่าวต้อนรับ แล้วนำเข้าสู่ช่วงพิธีเปิด | A | | Main | | | BG Music | ไฟเวทีเต็ม | ไมค์ลอย โพเดียม แฟ้มคำกล่าว | ยกโพเดียมขึ้นกลางเวที | | สมมติ ก. | สมมติ ข. : คิวไมค์ | ห้องประชุมใหญ่ | รอยืนยัน | PLANNING_ASSUMPTION | เวลา 2 นาทีเป็นค่าที่เสนอ ต้องยืนยันหลังซ้อม |

## Cue Enums

ดู `cue-enums-template.md`

## Open Items

| # | กฎที่ตรวจพบ | ความรุนแรง | คิว | สิ่งที่พบ | ต้องให้ใครยืนยัน | ภายในวันที่ | สถานะ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | | เปิด |

## กติกาที่ห้ามลืม

- ทุกแถวถือค่า `Block` ของตัวเอง ห้ามใช้ merged cell หรือช่องว่างแทนคำว่า "เหมือนแถวบน"
- หนึ่งแถวคือหนึ่ง action ถ้าอ่านแล้วต้องทำสองอย่างพร้อมกัน ให้แยกแถว
- `Lead` ว่างไม่ได้ ถ้ายังไม่รู้ว่าใคร ให้ใส่บทบาทและตั้ง `Status = รอยืนยัน`
- `Support` เขียนเป็น `ชื่อ : งานย่อย` บรรทัดละคน
- `Timer` ต้องไม่เกิน `Cue Duration` ถ้าสั้นกว่าโดยตั้งใจ ให้เขียนเหตุผลใน `Remark`
- ห้ามเขียนเบอร์โทร ทะเบียนรถ หรือเลขเที่ยวบินลงในตารางนี้
