# Worked Example — Run of Show พิธีเปิดงานประชุมวิชาการ (Synthetic Mode A + B)

**บริบทคำขอ (สังเคราะห์):** "ช่วยทำ Run of Show พิธีเปิดช่วงเช้า 08:30–09:30 น. จากกำหนดการ (ลงทะเบียน 08:30–09:00, พิธีเปิด 09:00–09:30 มีกล่าวต้อนรับและ VTR 3 นาที) พร้อมเช็กจุดเสี่ยงคิว"

---

## Mode A — Build Result

### Show Parameters

| รายการ | ค่า | Basis |
| --- | --- | --- |
| ชื่องาน / วันที่ / สถานที่ | `[รอยืนยันชื่องาน]` · `[รอยืนยันวันที่]` · `[รอยืนยันห้อง]` | Missing from source |
| เวลาเปิดประตู / ช่วงพิธี | ประตูเปิด 08:30 น. · พิธีเปิด 09:00–09:30 น. | From agenda brief |
| Show Caller / พิธีกร / AV Lead | `รอยืนยัน` · `รอยืนยัน` · `รอยืนยัน` | Require staff assignment |

### Run of Show Table

| Block | Time | Cue Dur | Visual (จอ LED) | Audio (เสียง) | Lighting (แสง) | Stage / Props | Lead | Support / Notes | Basis |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| B1 ลงทะเบียน | 08:30–08:55 | 25m | SLIDE-WELCOME-LOOP `[รอยืนยันไฟล์]` | BGM-AMBIENT #1 | Warm Wash 70% | โต๊ะลงทะเบียน + ป้าย QR | `รอยืนยัน (Hospitality)` | Floor staff แจกป้าย | From agenda + PLANNING_ASSUMPTION |
| B1 เตรียมเข้าห้อง | 08:55–09:00 | 5m | COUNTDOWN-05M `[รอยืนยันไฟล์]` | CHIME + BGM -30% | House Down 50% | ปิดประตูโถง 09:00 | `รอยืนยัน (Floor Mgr)` | พา VIP นั่งแถวหน้า | PLANNING_ASSUMPTION |
| B2 เปิดงาน | 09:00–09:04 | 4m | KEY-VISUAL-LOOP | MIC-MC1 Open + Sting SFX | Spotlight Stage Center | MC ขึ้นทาง Stage Left | `รอยืนยัน (MC)` | Show caller นับคิว | Cue decomposition |
| B2 เชิญประธาน | 09:04–09:07 | 3m | LOWER-THIRD `[ชื่อประธาน รอยืนยัน]` | MIC-VIP-PODIUM Ready | Wash + Lectern Spot | Stage staff นำประธานขึ้นแท่น | `รอยืนยัน (VIP Escort)` | รอยืนยันลำดับเกียรติ | Cue decomposition |
| B2 กล่าวเปิด | 09:07–09:20 | 13m | SLIDE-EVENT-BACKDROP | MIC-VIP-PODIUM Live | Lectern Spot 100% | น้ำดื่มบนโพเดียม | `รอยืนยัน (ประธาน)` | Timer จับ 12m เตือน 1m | Agenda split |
| B2 เปิด VTR | 09:20–09:25 | 5m | VTR-OPENING `[3m รอยืนยันไฟล์จริง]` | VTR Audio L/R (-Mics muted) | Dim 20% | เตรียมแท่นกดเปิด `[ถ้ามี]` | `รอยืนยัน (AV Lead)` | เผื่อ 2m สลับภาพ/เชื่อม | From brief (VTR 3m) |
| B2 ขอบคุณ/ถ่ายภาพ | 09:25–09:30 | 5m | KEY-VISUAL-STILL | BGM-UPBEAT + MIC-MC1 | Full Stage Bright | ป้าย/ผู้ร่วมเฟรมขึ้นเวที | `รอยืนยัน (Stage Mgr)` | MC ส่งเข้าช่วงถัดไป | Agenda end 09:30 |

### Open Items (ต้องยืนยันก่อน Rehearsal)

| ประเด็น | คิวที่กระทบ | ต้องให้ใครยืนยัน | ภายในวันที่ |
| --- | --- | --- | --- |
| ชื่อ-ตำแหน่งประธาน และลำดับเกียรติ | 09:04, 09:07 | เจ้าของงาน / ผู้มีอำนาจ (`official-signing`) | `[รอยืนยัน]` |
| รายชื่อไฟล์ VTR จริง + รหัส Scene LED | ทุกคิว Visual | AV Lead (`event-run-of-show` enums) | `[รอยืนยัน]` |
| ชื่อ Lead ประจำจุดลงทะเบียน เวที และเสียง | ทุกแถว | Show Caller / Project Owner | `[รอยืนยัน]` |

---

## เหตุผลที่ตัวอย่างนี้ตรงมาตรฐาน STeP
- รวมเวลาในแต่ละ block ตรงเป๊ะ (`25+5=30m`, `4+3+13+5+5=30m`) และติดป้าย `Basis` ชัดว่าคิวไหนมาจากต้นทาง คิวไหนเป็น `PLANNING_ASSUMPTION`
- ไม่แต่งชื่อประธาน ชื่อไฟล์สื่อ หรือชื่อ Lead เอง และไม่ระบุเบอร์โทร/ทะเบียนรถในตาราง
- ส่งต่อการอนุมัติลำดับเกียรติให้มนุษย์ (`official-signing`) และการวางงบ/จัดซื้อ AV ให้ `tor-government-writing`
