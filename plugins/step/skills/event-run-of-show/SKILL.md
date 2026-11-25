---
name: event-run-of-show
description: สร้างหรือตรวจ Run of Show / Sequence เวที ระดับคิวต่อคิว จาก agenda บรีฟ หรือ sequence เดิม ให้เป็นตารางที่แยก lane เวลา จอ เสียง แสง เวที และ Lead รายคิว พร้อมจับเวลารวมที่ไม่ตรง คิวที่ไม่มีผู้รับผิดชอบ และ placeholder ที่ยังค้าง โดยไม่ตัดสินคอนเซ็ปต์งาน ผังโซน ลำดับเกียรติ VIP หรือการจ้างทีมแสงเสียง
standardVersion: 3
---

# STeP Event Run of Show

## Purpose

เป็นด่าน **execution** ของงาน Event ต่อจากขั้นคอนเซ็ปต์ แปลง Agenda ระดับวาระให้เป็น **คิวที่ใช้จริงบนเวที** ซึ่งทีมพิธีกร จอ เสียง แสง เวที และ PM อ่านพร้อมกันได้จากตารางเดียว (`Mode A — Build` จาก agenda/บรีฟ หรือ `Mode B — Review` จาก sequence เดิม)

ไม่ใช่การตรวจ TOR การวางแผนจัดงานครบวงจร หรือการบริหารงบประมาณโครงการ

## เมื่อควรใช้

- "ช่วยทำรันคิวเวทีจากกำหนดการนี้" · "ขอ sequence เวทีแบบละเอียด มีคิวจอ คิวเสียง"
- "ทำ cue sheet ให้ทีม AV" · "เรียงลำดับพิธีเปิดทีละคิว"
- "ตรวจ sequence นี้ว่าเวลาตรงไหม ใครยังไม่มีชื่อ" · "ทำ run through สำหรับซ้อมใหญ่"

**Anti-trigger:**
- วางแผนจัดงานครบวงจร เทียบสถานที่ งบประมาณ และ Contingency รวม → `event-planner-pro`
- คอนเซ็ปต์งาน ธีม ผังบูธ เส้นทางผู้เข้าชม → `event-concept`
- แผนงาน งวดงาน หรือ Gantt ของโครงการ → `project-plan`
- ทำหรือแก้สไลด์ VTR ที่คิวอ้างถึง → `presentation-design`
- ตรวจ TOR หรือร่างขอบเขตงานจ้างออแกไนเซอร์ → `tor-review`, `tor-government-writing`
- เอกสารมีเบอร์โทร ทะเบียนรถ หรือข้อมูลการเดินทางของบุคคล → `data-privacy-compliance`

## Inputs

- ขั้นต่ำ Mode A: ชื่องาน วันที่ สถานที่ และ Agenda ระดับ block พร้อมช่วงเวลา
- ขั้นต่ำ Mode B: ไฟล์หรือข้อความ Sequence เดิม
- เสริม: จำนวนผู้เข้าร่วม ชื่อพิธีกร จำนวนจอ รหัส Scene ของทีม AV รายการ VTR/สไลด์ เวลา Load-in และเวลาจบแน่นอน
- ก่อนอ่านเอกสารแนบให้ใช้ Privacy Gate และลด PII; ข้อมูลที่ขาดเขียน `รอยืนยัน` ห้ามเดาเวลา ชื่อ หรือตำแหน่ง

## Source

- แหล่งหลักคือ **agenda บรีฟ หรือ sequence ที่ผู้ใช้ให้มา** (ไม่มี Source ภายนอกที่จำเป็นสำหรับโครงสร้างคิว)
- ถ้อยคำภาษาไทยของพิธีกร/คำกล่าว → `step-writing-rule` · ข้อมูลติดต่อ → `data-classification-rule` · จุดอนุมัติ → `human-approval-rule` · โลโก้/Key Visual บนจอ → `step-brand-ci-guideline`
- รหัส Scene/Format และตัวย่อชื่อคนเป็นข้อตกลงกับทีม AV จึงต้องตั้ง `รอยืนยัน` เสมอ
- แม่แบบและกติกาในโฟลเดอร์นี้: `references/lane-contract.md`, `references/review-checklist.md`, `templates/run-of-show-template.md`, `templates/cue-enums-template.md`

## Workflow

1. **Mode Gate:** หากมี sequence เดิมแนบมาให้ทำ Review ก่อนเสมอ แล้วเสนอ Build ฉบับแก้; หากมีเฉพาะ agenda ให้ทำ Build
2. **Privacy Preflight:** ผ่าน Privacy Gate ก่อนอ่านไฟล์แนบ ตัดค่าติดต่อ (เบอร์โทร ทะเบียนรถ เที่ยวบิน) ออก
3. **Block & Cue Decomposition:** สกัด `Block No./Time/Duration` แล้วแตกเป็น 1 action ต่อ 1 แถวตาม `references/lane-contract.md` (MC เชื่อม → MC เชิญ → วิทยากรขึ้น → เนื้อหา → MC ขอบคุณ → ลงเวที)
4. **Lane & Time Reconciliation:** เติมเฉพาะ lane ที่งานใช้จริง (lane ว่างให้ตัดออกและบันทึกว่า `ไม่ใช้ในงานนี้`), ตรวจผลรวม `Cue Duration` เทียบ `Block Duration` และบังคับ `Timer ≤ Cue Duration`
5. **Ownership & Assemble:** ระบุ `Lead` 1 คนต่อคิว (`Support` เป็น `ชื่อ : งานย่อย`, คิวไร้ Lead ขึ้นเป็น finding), ติดป้าย `Basis` ทุกแถว และสรุป findings ตาม `references/review-checklist.md` (Mode B) หรือออกตารางตาม `templates/run-of-show-template.md` (Mode A)

## Output

- **Mode A — Build:** Show Parameters (พร้อม `Basis`), Run of Show Table, `templates/cue-enums-template.md` (`รอยืนยัน` ทุกแถว), Open Items, และรายการ `PLANNING_ASSUMPTION`
- **Mode B — Review:** สรุปสถานะ Sequence (จำนวน block vs cue จริง, lane ว่าง, คิวไร้ Lead), Findings Table (`# | กฎ | ความรุนแรง | คิว/แถว | สิ่งที่พบ | สิ่งที่ต้องทำ`), สิ่งที่ผู้ใช้ต้องยืนยัน, และ Handoff
- ดูตัวอย่างผลลัพธ์มาตรฐานได้ที่ `examples/good-run-of-show.md`

## Authority

- **AI ช่วยได้:** แตกคิว คำนวณเวลา จัด lane ร่างบทเชื่อมพิธีกร และชี้ข้อบกพร่องจากเอกสาร
- **ต้องให้มนุษย์ตัดสิน (`human-approval-rule`):**
  - ลำดับเกียรติ ลำดับการเชิญ VIP และคำกล่าวเปิดงาน (`official-signing`)
  - การจ้างทีมแสงเสียง จอ LED หรือออแกไนเซอร์และวงเงิน (`procurement-approval`, `budget-allocation`)
  - การอนุมัติใช้ sequence จริงบนเวทีเป็นอำนาจของ show caller และเจ้าของงาน
- **AI ไม่ยืนยันว่าคิวทำทันจริงในเวลาที่กำหนด** ความเป็นไปได้จริงพิสูจน์จากการซ้อม (Dry Run) เท่านั้น

## Handoff

- คอนเซ็ปต์ ธีม หรือผังโซน → `event-concept` · แผนจัดงานภาพรวม → `event-planner-pro`
- สไลด์/VTR → `presentation-design` · แผน/งวดงาน → `project-plan` · จัดซื้อแสงเสียง → `tor-government-writing`
- PII ในคอลัมน์ติดต่อ → `data-privacy-compliance` · ถ้อยคำพิธีกร → `step-writing` · เชิญ VIP → `thai-official-documents`

พร้อมส่งต่อเมื่อ: ทุก block มีเวลาที่ตรวจแล้ว ทุกคิวมี Lead รหัส Scene ตั้ง `รอยืนยัน` และ Open Items มีผู้รับผิดชอบ

## Guardrails

- ห้ามแต่งชื่อวิทยากร ตำแหน่ง เวลา หรือชื่องาน; ชื่อที่สงสัยให้ flag ไว้ ห้ามแก้เอง
- ห้ามเขียนเบอร์โทร ทะเบียนรถ เลขเที่ยวบิน ลงในตารางแจกทีม; ห้ามเดาความหมายรหัส AV; ห้ามปล่อยคิวไร้ Lead หรือใช้ merged cell แทนค่า "เหมือนแถวบน"
- ห้ามปรับเวลาต้นทางให้ลงตัวเอง (รายงานส่วนต่างแทน) และในวันงานจริงห้ามเขียนทับชีตเดิม (สร้างเวอร์ชันใหม่)

## Environment

- ใช้งานได้ทั้ง STeP Desktop และ Claude plugin ร่วมกับ `references/lane-contract.md`, `references/review-checklist.md`, `templates/run-of-show-template.md`, `templates/cue-enums-template.md` และ `examples/good-run-of-show.md`
- เมื่อสร้างเป็นสเปรดชีตให้ใช้ capability/action ที่มีจริง และห้ามอ้างว่าสร้างไฟล์สำเร็จหากยังไม่มี output reference

## Pitfalls

- ใส่เลขเวลา `Cue Duration` รวมไม่ตรง `Block Duration` แล้วแอบบีบช่วงพักหรือลดเวลาพูดเอง → ต้องรายงานส่วนต่างเวลาใน Findings หรือ Open Items เสมอ
- คัดลอก sequence จากงานเก่าแล้วหลงชื่องานหรือเบอร์โทรติดต่อเดิม → ต้องล้างข้อมูลงานเก่าและสแกน PII ก่อนทุกครั้ง
- ใส่คิวจอ/ไฟโดยไม่มี Lead ชัดเจน → เกิดจุดบอดตอน Show Caller เรียกคิวจริง

## Verification

- ตรวจด้วย `node scripts/validate-repo.js` (Standard v3, ไม่มี emoji) และผ่าน `reviewPack()`
- ตรวจ routing 4 มิติใน `evals/skills/event-run-of-show.json` ผ่าน `npm test` (รวมถึง `test/playbooks.test.js`)
- ความสอดคล้องของเวลาและจังหวะจริงบนเวทีต้องผ่านการซ้อม Technical Rehearsal / Dry Run กับ Show Caller และทีม AV

## Maintenance

อัปเดตล่าสุด: 2026-11-25

- เจ้าของเนื้อหา: ทีม CC (`../../manifest/skills.yaml`, stage `pilot`)
- แก้ Skill นี้เมื่อสัญญา lane (`references/lane-contract.md`), Playbook (`../../docs/event-run-of-show.md`), หรือแม่แบบตารางคิวเปลี่ยน แล้วอัปเดตวันที่ข้างต้นทันที
