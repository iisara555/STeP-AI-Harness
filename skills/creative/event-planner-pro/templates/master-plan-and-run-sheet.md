# Templates — Master Plan & Run Sheet

ใช้คัดลอกไปปรับกรอกกับงานจริง โดยคงป้าย `PLANNING_ASSUMPTION` ไว้กับทุกตัวเลขหรือเงื่อนไขที่ยังไม่ได้รับการยืนยัน

## 1. Weighted Venue Selection Matrix

| เกณฑ์ประเมิน | น้ำหนัก | ตัวเลือก A | ตัวเลือก B | ตัวเลือก C | หมายเหตุจากการตรวจพื้นที่ |
| --- | ---: | ---: | ---: | ---: | --- |
| Capacity & Layout Flow | 25% | - | - | - | รอยืนยันจาก Site Visit |
| Technical & AV Infrastructure | 20% | - | - | - | รอยืนยัน 3-Phase / Rigging / Ethernet |
| Location, Transit & Accessibility | 20% | - | - | - | รอยืนยันที่จอดรถและทางลาด |
| Total Cost & Minimum Spend | 20% | - | - | - | รอยืนยันใบเสนอราคาจริง |
| Load-in / Load-out & Curfews | 15% | - | - | - | รอยืนยันขนาดลิฟต์และเวลา OT |
| **Weighted Score (`Σ คะแนน × น้ำหนัก`)** | **100%** | **0.00** | **0.00** | **0.00** | คะแนนฐาน 1–5 |

## 2. Expense Allocation & Contingency Reserve Table

| หมวดงบประมาณ | สัดส่วนสมมติ (`PLANNING_ASSUMPTION`) | รายการครอบคลุม | ประมาณการ (บาท) | จุดควบคุม / หมายเหตุระเบียบ |
| --- | ---: | --- | ---: | --- |
| 1. Venue & Space Rental | 20%–25% | ห้องหลัก ห้องย่อย มัดจำ บัฟเฟอร์ OT | `[รอยืนยัน]` | ต่อรองยกเว้นค่าห้องเทียบ F&B |
| 2. Food & Beverage (Catering) | 25%–30% | Coffee Break อาหารหลัก Crew Dietary | `[รอยืนยัน]` | ยืนยันยอดสุดท้าย `T-72 ชม.` (หากเบิก STeP ให้เช็ก AFP) |
| 3. AV, Production & Staging | 20%–25% | LED PA Lighting Backdrop Stream Crew | `[รอยืนยัน]` | ตรวจเงื่อนไข House AV ก่อนจ้างนอก |
| 4. Marketing, PR & Creative | 10%–15% | KV Landing Page สื่อสิ่งพิมพ์ ภาพ/วิดีโอ | `[รอยืนยัน]` | ใช้กราฟิกเวทีซ้ำบน Social Media |
| 5. Speakers, Talent & MC | 5%–10% | ค่าวิทยากร MC ที่พัก เดินทาง | `[รอยืนยัน]` | ล็อก Rider ในสัญญาตั้งแต่แรก |
| 6. Staffing, Permits & Tech | 5%–8% | ระบบลงทะเบียน Usher ประกัน ใบอนุญาต | `[รอยืนยัน]` | รวมประกันภัยบุคคลที่สาม |
| 7. Contingency Reserve (แยกต่างหาก) | 10%–15% | เหตุสุดวิสัย อุปกรณ์เสริมด่วน พิมพ์ด่วน EMT | `[รอยืนยัน]` | ห้ามนำไปใช้กับค่าใช้จ่ายตามแผน |

## 3. Master Run Sheet Skeleton

| Time | Dur. | Segment / Activity | Stage & Room Action | AV / Lighting / Media Cue | Talent / Speaker | PIC (Owner) |
| --- | ---: | --- | --- | --- | --- | --- |
| 06:30 | 60m | Crew Call & Final Rig Check | ปิดประตูโถง ตรวจพื้นที่ ตั้งโต๊ะลงทะเบียน | House lights 100%; เช็ก PA / LED pattern | Tech Crew | Production Mgr |
| 07:30 | 30m | Briefing & Mic Check | Usher ประจำจุด MC/SM ซ้อมคิวเปลี่ยน | ทดสอบ Lavalier + Handheld; BGM Loop #1 | MC, Floor Staff | Stage Manager |
| 08:00 | 60m | Doors Open & Registration | เปิดรับ VIP Fast-Track และ Coffee foyer | Main LED: Welcome Loop; Stage: Warm Amber | Registration Team | Hospitality Lead |
| 08:55 | 05m | 5-Minute Curtain Call | Usher พาผู้เข้าร่วมเข้าโถง ปิดประตู 09:00 | Audio Chime; BGM ลด 30%; Countdown 5m | Floor Ushers | Floor Manager |
| 09:00 | 05m | Opening Sequence & MC Welcome | สปอตไลต์กลางเวที MC เข้าทาง Stage Left | Opening Sting SFX; LED Motion Graphic | MC | Show Director |
| `[ขยายต่อ]` | `[m]` | `[ช่วงหลักถึงปิดงาน + Strike/Load-Out]` | `[การเคลื่อนไหวจริง]` | `[ชื่อไฟล์ media, เลขไมค์, แสง]` | `[บทบาท]` | `[เจ้าของ 1 คน]` |

## 4. รายการสมมติฐานและประเด็นที่ต้องยืนยัน (Open Items)

| หัวข้อ | ประเภท (`Fact` / `PLANNING_ASSUMPTION`) | สิ่งที่ต้องยืนยันก่อนใช้งานจริง | ผู้รับผิดชอบ / กำหนดส่ง |
| --- | --- | --- | --- |
| จำนวนผู้เข้าร่วมและ VIP จริง | `PLANNING_ASSUMPTION` | ยืนยันยอดเปิดลงทะเบียนและสัดส่วน VIP | เจ้าของงาน (`T-...`) |
| ใบเสนอราคาสถานที่ / AV / Catering | `PLANNING_ASSUMPTION` | ขอใบเสนอราคาจริงและทำจัดซื้อจัดจ้างตามระเบียบ | เจ้าของงาน / AFP (`T-...`) |
