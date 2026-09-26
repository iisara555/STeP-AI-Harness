# Pilot Operations — 1 Month

**As of:** 2026-09-25

**Released distribution baseline:** v0.7.3 (GitHub Release 2026-09-21; รุ่นที่ผู้ทดสอบรอบแรกใช้อยู่) · v0.7.4 มี GitHub Release 2026-09-25 แต่ไม่แจก ผู้ทดสอบข้ามไป v0.7.5

**Prepared Pilot candidate:** v0.7.5 — รอ Release Gate; รอบแรกวันที่ 22 กันยายน 2569 ใช้ v0.7.3 ตาม [คู่มือรอบ Pilot](pilot-runbook.md); ผู้ประสานงาน STeP AI Geek; สิ่งที่เปลี่ยนดู [CHANGELOG](../CHANGELOG.md)

**Repository scope:** `main` may contain post-v0.7.3 changes; do not treat `main` as a released employee package until tagged/released.

**Current `main` inventory:** 50 Skills / 49 router entries / 5 Playbooks / 4 Actions / 22 teams / 5 routing clusters

## ขอบเขต

ระยะเวลา **4 สัปดาห์** เริ่ม 22 กันยายน 2569 ด้วย released Pilot v0.7.3 เป็น distribution baseline; การอัปเดตกลาง Pilot (เช่น v0.7.5) ต้องผ่าน Release Gate และแจกผ่าน Update ไม่ใช่ติดตั้งใหม่

- เปิดใช้ได้กับ 22 ทีม
- มี Core Pilot Users จากทีมที่เข้าร่วม ครอบคลุมทั้ง 5 routing clusters
- รอบแรกใช้ทั้ง Windows/macOS และหลายโปรแกรม AI; รายชื่อทีมจริงบันทึกก่อนเริ่ม ไม่สมมติว่าครบทุก cluster แล้ว
- QS/GA/CC และอย่างน้อยหนึ่งทีมจากแต่ละ cluster ต้องมีผู้ใช้จริง
- พนักงานทั่วไปใช้ภาษาไทยตามงานจริง ไม่ต้องใช้ Git/Terminal/Skill ID

## Week 0 — Preflight

ก่อนเริ่มนับ Pilot:
- ติดตั้ง/อัปเดต released Pilot v0.7.3 หรือรุ่นถัดไปที่ผ่าน Release Gate
- รัน CI และ Pilot readiness suite ให้เขียว
- ทดสอบ update + rollback อย่างน้อย 1 เครื่อง Windows และ 1 เครื่อง macOS ถ้ามี
- ยืนยัน feedback channel และผู้รับผิดชอบ triage
- ยืนยัน Public/Private model ของ repository และช่องทาง distribution ตาม `docs/repository-data-boundary.md`
- ย้ำ Browser credential policy และ Human Confirmation Gate
- freeze feature ใหม่ที่ไม่จำเป็น

## Week 1 — Everyday Work

โฟกัสงาน low/medium risk:
- สรุปประชุม
- เอกสาร/ร่างงาน
- Creative/Image Prompt
- Project/market/customer analysis
- Output management

เก็บ wrong-route, missing-context และ usability friction

## Week 2 — Browser & Cross-Team

เปิด Browser Form Assistant กับผู้ใช้ Pilot:
- login ครั้งแรกโดย user
- opt-in remembered login
- draft/review
- submit ต้องยืนยัน
- ทดสอบ session expiry/manual fallback

เริ่ม cross-team routing และ output handoff

## Week 3 — ISO / Governance

ใช้ ISO Audit Readiness Pack กับ Process Owners:
- evidence matrix
- document/record control
- mock interview
- QMS risk/KPI
- NCR/CAPA
- management review prep

AI ช่วยเตรียม แต่ conformity/closure ยังเป็น Human Authority

## Week 4 — Stability & Decision

- ทดสอบ self-update/rollback
- review incidents และ false blocks/false allows
- survey ผู้ใช้
- สรุป Keep / Improve / Remove
- ตัดสิน Go / Extend Pilot / Stop

## ตัวชี้วัด

- Secret/Credential incident: **0**
- Unauthorized consequential action: **0**
- Data loss from install/update/output: **0**
- Scenario routing regression suite: **100% pass**
- งานจริงที่นำผลลัพธ์ไปใช้ต่อได้หลังแก้เล็กน้อย: **≥ 80%**
- ผู้ใช้ Pilot ที่ทำงานหลักได้โดยไม่ใช้ Terminal: **≥ 90%**
- install/update สำเร็จโดยไม่ต้องแก้ manual: **≥ 90%**

## รอบการดูแล

- ทุกวัน: security/data-loss incident triage
- ทุกสัปดาห์: feedback + wrong-route + false-block review
- สิ้น Week 2: midpoint review
- สิ้น Week 4: Pilot decision

## Change Policy ระหว่าง Pilot

ทำทันที:
- security fix
- data-loss fix
- authority/human-gate fix
- critical routing collision

รวมเป็น weekly batch:
- trigger wording
- prompt quality
- docs/UX clarification

เลื่อนไปหลัง Pilot:
- feature ใหม่ที่ไม่จำเป็น
- architecture refactor
- workflow engine เพิ่มเติม
