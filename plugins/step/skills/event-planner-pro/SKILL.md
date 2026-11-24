---
name: event-planner-pro
description: วางแผนจัดงาน Event แบบครบวงจร (Conference, Workshop, Gala Dinner, Product Launch, Exhibition, Hybrid/Virtual) ตั้งแต่ Phase 0 Event Charter การเทียบเลือกสถานที่แบบถ่วงน้ำหนัก การจัดสรรงบประมาณพร้อม Contingency Reserve ไทม์ไลน์ถอยหลัง รายการตรวจ AV/อาหาร/VIP ตาราง Master Run Sheet แผนสำรอง และประเมินผล ROI หลังจบงาน โดยไม่ตัดสินคอนเซ็ปต์งาน รันคิว AV รายวินาที หรือแต่งข้อมูลจัดซื้อจัดจ้างแทนมนุษย์
standardVersion: 3
---

# STeP Event Planner Pro

## Purpose

ทำหน้าที่เป็นคู่มือวางแผนบริหารการจัดงาน Event แบบครบวงจร (`Event Producer & Operations Planning`) เพื่อเปลี่ยนโจทย์การจัดงานให้เป็นแผนปฏิบัติการที่ลดจุดบอดหน้างาน ทั้งงบประมาณ สถานที่ เทคนิค AV อาหารเฉพาะกลุ่ม ใบอนุญาต และแผนสำรองฉุกเฉิน

Skill นี้สร้าง **ร่างแผนปฏิบัติการ (`Event Master Plan` หรือเฉพาะโมดูลที่ขอ)** โดยแยกข้อเท็จจริงจากผู้ใช้และระเบียบองค์กรออกจากสมมติฐาน (`PLANNING_ASSUMPTION`) อย่างชัดเจน ไม่สร้างราคาผู้รับเหมา กฎอาคาร หรือการอนุมัติงบประมาณขึ้นเอง

## เมื่อควรใช้

ใช้เมื่อผู้ใช้ต้องการวางแผนจัดงาน Event ในมิติปฏิบัติการ งบประมาณ สถานที่ หรือบริหารโครงการจัดงาน เช่น:
- "ช่วยวางแผนจัดงานสัมมนา / Conference / Gala / Exhibition / Product Launch แบบครบวงจร"
- "ทำตารางเทียบเลือกสถานที่จัดงาน 3 แห่งแบบถ่วงน้ำหนัก (Weighted Venue Selection Matrix)"
- "จัดสัดส่วนงบประมาณจัดงาน พร้อม Contingency Reserve และจุดคุ้มทุน"
- "วางไทม์ไลน์ถอยหลังเตรียมจัดงานล่วงหน้าจนถึงสรุปผล ROI หลังจบงาน"
- "ทำ Master Run Sheet พร้อมแผนสำรอง (Contingency Plan) และ Checklist อุปกรณ์ AV / อาหาร / VIP"

**Anti-trigger (ส่งต่อไปยัง Skill เฉพาะทางของ STeP):**
- คิดธีม คอนเซ็ปต์งาน ผังบูธ/โซนกิจกรรม หรือ Signature Moment ของ STeP → `event-concept`
- แตก Sequence เวทีและคิว จอ/เสียง/แสง รายวินาทีจาก Agenda จริง → `event-run-of-show`
- ร่างหรือตรวจขอบเขตงาน (TOR) จ้างออแกไนเซอร์/ระบบแสงเสียงตามระเบียบพัสดุ → `tor-government-writing`, `tor-review`
- ร่างหนังสือเชิญ บันทึกข้อความ หรือหนังสือราชการ → `thai-official-documents`
- ตรวจเกณฑ์เบิกจ่าย Lead Time หมวดค่าใช้จ่าย หรือจ้างเหมารถตู้ของ AFP → `afp-operations-lookup`
- วางแผนโครงการ/WBS/Gantt ทั่วไปที่ไม่ใช่งานผลิตอีเวนต์ → `project-plan`
- ตรวจไฟล์รายชื่อผู้เข้าร่วมที่มีข้อมูลส่วนบุคคล (เบอร์โทร เลขบัตร ทะเบียนรถ) → `data-privacy-compliance`

## Inputs

### Phase 0: Discovery & Event Charter (ข้อมูลตั้งต้น 5 ข้อ)
ก่อนสร้างแผน ให้ตรวจว่าผู้ใช้ให้ข้อมูลครบ 5 ด้านหรือไม่ หากขาดให้ถามสั้น ๆ หรือสร้างแผนฐานทันทีโดยติดป้ายค่าที่สมมติทุกจุดเป็น `PLANNING_ASSUMPTION`:
1. **ประเภทและขนาดงาน:** Conference, Workshop, Gala Dinner, Product Launch, Exhibition หรือ Hybrid/Virtual และจำนวนผู้เข้าร่วม (Pax)
2. **เป้าหมายหลักและ KPI:** เช่น Lead generation, การรับรู้แบรนด์, ยอดบัตร หรือความพึงพอใจผู้เข้าร่วม
3. **กลุ่มผู้เข้าร่วม:** โปรไฟล์ผู้ชม สัดส่วน VIP ข้อจำกัดการเข้าถึง (Accessibility) และข้อจำกัดด้านอาหาร
4. **วัน เวลา และรูปแบบ:** ครึ่งวัน เต็มวัน หลายวัน หรือช่วงเย็น รูปแบบ In-person / Hybrid / Virtual
5. **สถานที่และระดับงบประมาณ:** เมือง/ลักษณะสถานที่ งบรวมหรือต่อหัว โทนงาน (ทางการ / สร้างสรรค์)

- ข้อมูลเสริม: บรีฟโครงการ, เอกสาร TOR, Spec สถานที่, เงื่อนไขเวลา Load-in ของอาคาร
- รายละเอียดโครงสร้างทั้ง 8 โมดูลดูที่ `references/production-modules.md`

## Source

- ข้อมูลหลักมาจาก **โจทย์ บรีฟ สเปกสถานที่ และใบเสนอราคาจริงที่ผู้ใช้ให้มา** ตัวเลขราคาและกำหนดการที่ไม่ได้ระบุต้องติดป้าย `PLANNING_ASSUMPTION` หรือ `รอยืนยัน`
- งานภายใต้บริบท STeP ให้เชื่อมแหล่งอ้างอิงที่ตรวจได้:
  - แบบฟอร์มระบบคุณภาพงานจัดงาน (**FM-CC-010**) อ้าง [ทะเบียนเอกสารระบบคุณภาพ ทีม CC](../../docs/knowledge/cc-iso-document-register.md) (ดาวน์โหลดจาก STeP : MIS เท่านั้น; FM-CC-001 / FM-CC-003 / FM-CC-008 ยกเลิกแล้ว)
  - อัตลักษณ์และงานเขียนองค์กร → `step-brand` และ `step-writing`
  - ระเบียบเบิกจ่าย/พัสดุ → `afp-operations-lookup` และ `tor-government-writing`
  - ขอบเขตอำนาจอนุมัติ → `human-approval-rule`

## Workflow

1. **Discovery Gate (Phase 0):** สรุป Event Charter จากข้อมูลจริง ระบุค่าที่ขาดเป็น `รอยืนยัน` หรือ `PLANNING_ASSUMPTION`
2. **Select Scope:** ถ้าขอแผนครบวงจรให้สร้าง Module 1–8 ตามโครงใน `references/production-modules.md` ถ้าขอเจาะจงเฉพาะเรื่อง (เช่น เทียบสถานที่ งบ Run Sheet Checklist แผนสำรอง หรือ ROI) ให้ลงลึกเฉพาะโมดูลนั้น
3. **Build Core Operations Plan:**
   - **Charter & Journey (M1):** KPI + 4 ช่วงประสบการณ์ (Pre-Arrival → Arrival & Registration ≤ 3 นาที → Core Program → Departure & Follow-up)
   - **Weighted Venue Matrix (M2):** เกณฑ์ 5 ด้านถ่วงน้ำหนัก 25/20/20/20/15% (Layout, AV/Wi-Fi, ทำเล/ทางลาด, ค่าเช่า/Min Spend, Load-in/Curfew)
   - **Budget & Contingency (M3):** 6 หมวดค่าใช้จ่ายหลัก + **Contingency Reserve 10%–15% แยกต่างหาก** (+ Sponsorship & Break-Even สำหรับงานมีรายได้)
   - **Backward Timeline (M4):** 6 ระยะตั้งแต่ Conception จนถึง Hot Wash (`T-12 เดือน` ถึง `T+14 วัน` ปรับสเกลตามเวลาจริง)
   - **Run Sheet & Checklists (M5–M6):** Pre-Doors → Live Show → Strike/Load-Out (มี PIC 1 บทบาทต่อแถว) + Checklist ด้าน AV Redundancy, Dietary, และ VIP Green Room
   - **Risk & ROI (M7–M8):** แผนสำรอง 5 กรณีวิกฤต + ตัวชี้วัดเชิงปริมาณ/คุณภาพ (`T+24 ชม.` และ `T+14 วัน`)
4. **Separate Facts vs Assumptions:** ใช้รูปแบบตารางใน `templates/master-plan-and-run-sheet.md` และแนบรายการ Open Items ที่ต้องยืนยันหน้างานหรือกับฝ่ายพัสดุ/สถานที่
5. **Offer Next Artifact:** เสนอเอกสารต่อยอด เช่น MC Cue Script, รายการประกอบ TOR, แพ็กเกจผู้สนับสนุน หรือ Email/SMS แจ้งเตือนผู้เข้าร่วม

## Output

- ใช้ภาษาเดียวกับผู้ใช้ (ค่าเริ่มต้นภาษาไทย) โดยคงคำศัพท์มาตรฐานงานผลิต (Run Sheet, Cue, FOH, Dry Run, Technical Rehearsal, Load-in/Load-out, VIP Green Room, RACI) จัดรูปแบบพร้อมคัดลอกลง Google Docs / Google Sheets / Notion
- ปิดท้ายทุกครั้งด้วยตาราง **`PLANNING_ASSUMPTION` & Open Items** และข้อเสนอส่งต่อไปยังเอกสารขั้นถัดไป
- ดูตัวอย่างผลลัพธ์มาตรฐานได้ที่ `examples/good-event-master-plan.md`

## Authority

- **AI ช่วยจัดทำได้:** กรอบแผนงาน Event Charter, ตารางคะแนนสถานที่, แบบจำลองงบประมาณสมมติ, ไทม์ไลน์ถอยหลัง, ร่าง Master Run Sheet, Operational Checklists, แผนสำรอง และกรอบวัดผล ROI
- **มนุษย์ต้องยืนยัน (Confirm Required):** ราคาใบเสนอราคาจริง, Minimum Spend และค่า OT สถานที่, สเปกไฟ 3 เฟสและ Rigging จาก Site Visit, ข้อมูลจำเพาะผู้เข้าร่วม และเกณฑ์เบิกจ่ายจริงตามเอกสาร AFP
- **อำนาจตัดสินใจของมนุษย์เท่านั้น (Human-Only):** การอนุมัติงบประมาณ ลงนามสัญญาสถานที่/ผู้รับเหมา, จัดซื้อจัดจ้าง (`procurement-approval`), ลำดับเกียรติและหนังสือเชิญ VIP (`official-signing`), และการส่งข้อความแจ้งเตือนหรือแบบสำรวจจริงถึงผู้เข้าร่วมงาน

## Handoff

งานพร้อมส่งต่อเมื่อทุกค่าสมมติติดป้าย `PLANNING_ASSUMPTION` และมีรายการ `Open Items` พร้อมผู้รับผิดชอบ:
- เจ้าของงาน / ทีมจัดงาน → ยืนยันงบฐาน เลือกสถานที่ และลงตรวจ Site Visit
- งานสร้างสรรค์และผังพื้นที่ → ส่งต่อ `event-concept`
- งานคิวเวทีและทีม AV → ส่งต่อ `event-run-of-show`
- งานพัสดุและเบิกจ่าย → ส่งต่อ `tor-government-writing` / `afp-operations-lookup`
- หนังสือเชิญทางการ → ส่งต่อ `thai-official-documents`

## Guardrails

- **Privacy First:** ใช้แนวทาง `data-classification-rule` และ Privacy Gate ก่อนอ่านรายชื่อผู้เข้าร่วมหรือวิทยากร ห้ามนำเบอร์โทร ทะเบียนรถ หรือข้อมูลแพ้อาหารรายบุคคลมาแสดงในร่างแผน
- **No Fabricated Costs or Rules:** ห้ามแต่งราคากลาง ค่าสถานที่ หรือระเบียบเบิกจ่าย STeP ขึ้นเอง ถ้าไม่มีข้อมูลจริงให้ระบุ `รอยืนยัน` หรือ `PLANNING_ASSUMPTION`
- **No Unapproved Side Effects:** ห้ามส่งอีเมล/SMS, ลงนามเอกสาร, จองสถานที่ หรืออนุมัติงบแทนผู้มีอำนาจ และห้ามสร้างแบบฟอร์ม ISO นอกเหนือจาก STeP : MIS (เช่น FM-CC-010)

## Environment

- ใช้งานได้ทั้ง STeP Desktop และ Claude plugin โดยอ้างอิงเอกสารภายในชุดเดียวกัน (`references/production-modules.md`, `templates/master-plan-and-run-sheet.md`, `examples/good-event-master-plan.md`)
- ไม่ต้องใช้เครื่องมือภายนอกหรือรหัสลับ; เมื่ออ่านไฟล์รายชื่อหรือสเปกจากผู้ใช้ให้ผ่าน Privacy Gate เสมอ

## Pitfalls

- เอาสัดส่วนงบประมาณมาตรฐานมาตอบเป็นงบจริงโดยไม่ติดป้าย `PLANNING_ASSUMPTION` → เสี่ยงทำให้งบประมาณผิดเพี้ยนจากราคาจริงหรือระเบียบ AFP
- นำ Contingency Reserve 10%–15% ไปรวมเป็นงบใช้จ่ายปกติตั้งแต่ต้น → ไม่เหลืองบกันชนสำหรับเหตุฉุกเฉินหน้างาน
- จัดตาราง Run Sheet ขาดช่วง Crew Call ก่อนเปิดประตูและ Strike/Load-Out หลังปิดงาน → ทำให้ทีม AV และสถานที่เข้าทำงานไม่ทันกำหนด
- แย่งงานคิวเวทีรายละเอียดจาก `event-run-of-show` หรือผังบูธ/ธีมจาก `event-concept` → ทำให้ทีมต้องแก้ซ้ำสองรอบ

## Verification

- ตรวจด้วย `node scripts/validate-repo.js` (โครงสร้าง Standard v3, ไม่มี secret, ไม่มี emoji)
- ตรวจ routing 4 มิติด้วย `evals/skills/event-planner-pro.json` ผ่าน `npm test` (ไม่ชน `event-concept`, `event-run-of-show`, `project-plan`, `tor-government-writing`)
- ก่อนนำไปใช้กับงานจริง ต้องให้เจ้าของงานหรือทีม CC/AFP ทบทวนงบประมาณและรายการ Open Items ทุกครั้ง

## Maintenance

อัปเดตล่าสุด: 2026-11-25

- เจ้าของเนื้อหา: ทีม CC (`../../manifest/skills.yaml`) สถานะ **draft รอ CC ทบทวนและอนุมัติ**
- ปรับแก้ Skill นี้เมื่อขั้นตอนจัดงานของทีม CC, แบบฟอร์มใน `../../docs/knowledge/cc-iso-document-register.md`, หรือขอบเขตเทียบกับ `event-concept` / `event-run-of-show` เปลี่ยน แล้วอัปเดตวันที่ข้างต้นทันที
