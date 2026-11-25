# Worked Example — แผนแม่บทงานประชุมวิชาการและนวัตกรรมประจำปี (Synthetic)

**บริบทคำขอตัวอย่าง (สังเคราะห์):** ทีม CC ได้รับโจทย์ "ช่วยวางแผนจัดงานประชุมสัมมนาประจำปีสำหรับผู้ประกอบการและพันธมิตร 250 คน เต็มวัน 1 วัน แบบ Hybrid พร้อมเกณฑ์เทียบเลือกสถานที่ งบประมาณสมมติฐาน 1,000,000 บาท Master Run Sheet และแผนสำรอง"

---

## 1. Phase 0: Event Charter Summary
- **ประเภทและขนาดงาน:** Annual Innovation Conference & Partner Showcase — 250 Pax (Onsite) + Live Stream (Hybrid `PLANNING_ASSUMPTION`)
- **เป้าหมายหลัก & KPIs (`PLANNING_ASSUMPTION`):** อัตราเช็กอิน ≥ 80% (200 คน), คะแนนความพึงพอใจ NPS ≥ 8.5, Sponsor/Partner Leads ≥ 40 รายการ
- **ผู้เข้าร่วม:** ผู้ประกอบการ พันธมิตร และผู้บริหาร (VIP `[รอยืนยันจำนวนจริง]`, ข้อมูลอาหารเฉพาะกลุ่ม `[เก็บผ่านฟอร์มลงทะเบียนโดยตัด PII ในแผนรวม]`)
- **รูปแบบ & กรอบงบประมาณ:** เต็มวัน (08:00–17:00 น.) · กรอบงบประมาณฐาน 1,000,000 บาท (รวม Contingency Reserve 12%)

## 2. Weighted Venue Selection Matrix (ตัวอย่างเกณฑ์ประเมิน)

| เกณฑ์ประเมิน | น้ำหนัก | ศูนย์ประชุม A (ในเมือง) | โรงแรม B (ใกล้สนามบิน) | ห้องโถงสถาบัน C | หมายเหตุที่ต้องตรวจ |
| --- | ---: | ---: | ---: | ---: | --- |
| Capacity & Layout Flow (250 Pax + Showcase) | 25% | `[รอยืนยัน Site Visit]` | `[รอยืนยัน]` | `[รอยืนยัน]` | ต้องไม่มีเสาบังกลางโถงและมี 2 ห้องย่อย |
| Technical & AV (Ethernet + 3-Phase + เสียง) | 20% | `[รอยืนยัน]` | `[รอยืนยัน]` | `[รอยืนยัน]` | ต้องมี Dedicated LAN สำหรับ Live Stream |
| Location, Transit & Accessibility | 20% | `[รอยืนยัน]` | `[รอยืนยัน]` | `[รอยืนยัน]` | ตรวจทางลาดและที่จอดรถบัส/รถยนต์ |
| Total Cost & Minimum Spend Flexibility | 20% | `[รอยืนยัน]` | `[รอยืนยัน]` | `[รอยืนยัน]` | เทียบค่าเช่าห้อง vs ยอด F&B |
| Load-in / Load-out Logistics & Curfews | 15% | `[รอยืนยัน]` | `[รอยืนยัน]` | `[รอยืนยัน]` | ตรวจลิฟต์ขนของและชั่วโมงเข้าตั้งวัน `T-1` |
| **Weighted Total Score** | **100%** | **รอคะแนนสำรวจจริง** | **รอคะแนนสำรวจจริง** | **รอคะแนนสำรวจจริง** | AI ไม่แต่งคะแนนแทนผล Site Visit |

## 3. Budget Allocation Model (ฐาน 1,000,000 บาท — `PLANNING_ASSUMPTION`)

| หมวดงบประมาณ | สัดส่วน (`PLANNING_ASSUMPTION`) | กรอบประมาณการ (บาท) | หมายเหตุการควบคุม |
| --- | ---: | ---: | --- |
| 1. Venue & Space Rental | 20% | 200,000 | ต่อรองยกเว้นค่าห้องเมื่อใช้ยอด F&B ขั้นต่ำ |
| 2. Food & Beverage (250 Pax + Crew) | 25% | 250,000 | ยืนยันยอดสุดท้าย `T-72 ชม.` (เบิกจ่ายจริงต้องตรวจเกณฑ์ AFP) |
| 3. AV, Production & Hybrid Streaming | 22% | 220,000 | ใช้ Dual-Laptop Hot Backup + Dedicated LAN + FOH UPS |
| 4. Marketing, PR & Creative Assets | 10% | 100,000 | นำ Key Visual เวทีมาตัดเป็นสื่อประชาสัมพันธ์ออนไลน์ |
| 5. Speakers, Talent & MC | 6% | 60,000 | ล็อก Rider และไฟล์ 16:9 ล่วงหน้า `T-14 วัน` |
| 6. Staffing, Permits & Registration Tech | 5% | 50,000 | รวมระบบ QR Check-in, Usher และประกันภัยบุคคลที่สาม |
| 7. Contingency Reserve (กันแยกต่างหาก) | 12% | 120,000 | ห้ามนำมาจัดสรรล่วงหน้า ใช้เฉพาะเหตุฉุกเฉิน |
| **รวมทั้งหมด** | **100%** | **1,000,000** | ต้องขอใบเสนอราคาจริงและอนุมัติงบโดยผู้มีอำนาจ |

## 4. Backward Milestones (สรุปย่อสำหรับกรอบเตรียมงาน 4 เดือน)
- **T-4 ถึง T-2 เดือน:** Site Visit 3 แห่ง, ล็อกสถานที่/สเปก, เปิดลงทะเบียน, ออก TOR จ้าง AV/Catering (ส่งต่อ `tor-government-writing`)
- **T-4 ถึง T-2 สัปดาห์:** ล็อก Run Sheet v1.0, รวบรวมสไลด์ 16:9, ยื่นใบอนุญาตและประกันภัยกับอาคาร
- **T-3 ถึง T-1 วัน:** ยืนยันยอดอาหารและ Dietary (`T-72 ชม.`), Load-in + Dry Run + Mic Check (`T-1 วัน`)
- **D-Day ถึง T+14 วัน:** รันงานตาม Run Sheet → Strike/Load-out → ส่งแบบสำรวจ 3 นาที (`T+24 ชม.`) → Hot Wash & ROI Report (`T+14 วัน`)

## 5. Master Run Sheet (ช่วงเปิดถึงพิธีเปิด + ปิดงาน)

| Time | Dur. | Segment / Activity | Stage & Room Action | AV / Lighting / Media Cue | Talent / Speaker | PIC (Owner) |
| --- | ---: | --- | --- | --- | --- | --- |
| 06:30 | 60m | Crew Call & Final Rig Check | ตรวจโถง เปิดจุดลงทะเบียน QR | House Lights 100%; เช็ก PA / LED / Ethernet + 5G | Tech Crew | Production Mgr |
| 07:30 | 30m | Briefing & Mic Check | Usher ประจำจุด ซ้อมส่งไมค์และรับ VIP | เทส Handheld/Lavalier; BGM Loop #1; เปิดสตรีมเตรียม | MC & Floor Staff | Stage Manager |
| 08:00 | 60m | Doors Open & Registration | เปิดลงทะเบียน + VIP Fast-Track + Coffee foyer | LED: Welcome Loop; Stage: Warm Amber | Registration Team | Hospitality Lead |
| 08:55 | 05m | 5-Minute Curtain Call | เชิญผู้ร่วมงานเข้าห้อง ปิดประตู 09:00 | Chime Cue; BGM Fade -30%; Timer บนจอ | Ushers | Floor Manager |
| 09:00 | 15m | Opening Sequence & Keynote | MC เปิดงาน + ประธานกล่าวเปิด | Opening Sting; Keynote Deck 16:9 + Confidence Monitor | MC / `[ประธาน]` | Show Director |
| 16:30 | 30m | Closing & Survey Trigger | MC สรุปปิด เชิญสแกน QR แบบสำรวจ | Outro Loop; แสดง QR Feedback บน LED | MC | Stage Manager |
| 17:00 | 120m | Strike & Load-Out | เคลียร์เวที ตรวจรับพื้นที่คืนอาคาร | ตัดไฟ FOH ตามลำดับ; เก็บอุปกรณ์ขึ้นท่าโหลด | Tech & Venue Crew | Production Mgr |

## 6. Risk Matrix & Checklists สรุป (เน้นจุดสำคัญหน้างาน)
- **AV Redundancy:** ระบบ Switcher 2 เครื่องพร้อม Hot Backup Input B, สาย Ethernet แยก + 5G Failover, UPS หน้า FOH
- **Dietary & VIP:** แยกจุดกาแฟ 2 ฝั่ง (≥ 2 จุด/150 คน), บันทึกยอด Vegetarian/Halal/Allergy แยกป้าย, จัด VIP Green Room และ Escort รายบุคคล
- **Contingency:** หาก Keynote มาสายสลับช่วง Panel/Q&A; หากเน็ตหลุดขึ้น Technical Pause Slate และบันทึกไฟล์ลง SD Card

## 7. `PLANNING_ASSUMPTION` & สิ่งที่ต้องยืนยันก่อนลงมือ (Open Items)
1. ยืนยันสถานที่จริงจาก Site Visit และแบบฟอร์ม **FM-CC-010** (จาก STeP : MIS) — **เจ้าของงาน / CC**
2. อนุมัติงบประมาณ 1,000,000 บาท และจัดทำ TOR จ้างผลิต (ส่งต่อ `tor-government-writing`) — **ผู้มีอำนาจ / พัสดุ AFP**
3. กำหนดลำดับเกียรติ VIP และลงนามหนังสือเชิญทางการ (ส่งต่อ `thai-official-documents`) — **ผู้มีอำนาจลงนาม**

**เอกสารขั้นถัดไปที่ช่วยจัดทำต่อได้ทันที:** 1) ร่างรายการความต้องการสำหรับใส่ใน TOR (`tor-government-writing`) · 2) แตก Concept/ผังโซน Showcase (`event-concept`) · 3) ขยาย Run of Show รายวินาทีแยก Lane ทีม AV (`event-run-of-show`)

---

## เหตุผลที่ตัวอย่างนี้ตรงมาตรฐาน STeP
- ไม่แต่งคะแนน Site Visit หรือราคาสถานที่จริงเป็นข้อเท็จจริง และติดป้าย `PLANNING_ASSUMPTION` กับงบประมาณและ KPI ทุกตัว
- กัน Contingency Reserve 12% แยกชัดเจน ไม่ปนในหมวดใช้จ่าย
- แยกขอบเขตชัด: ส่งต่อการออก TOR (`tor-government-writing`), คอนเซ็ปต์/ผังบูธ (`event-concept`), คิวเวทีรายวินาที (`event-run-of-show`), และหนังสือเชิญ (`thai-official-documents`) พร้อมชี้ Human-Only Authority ชัดเจน
