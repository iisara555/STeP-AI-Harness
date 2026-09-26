# Skill Quality Baseline — 2026-09-25

สถานะ: development baseline หลังเพิ่ม eval รายตัวและตัวอย่างคำตอบ

แทนที่ baseline วันที่ 2026-09-20 ซึ่งนับ 46 Skills

## Scope

| รายการ | จำนวน |
| --- | ---: |
| Registered Skills | **50** |
| Lifecycle | approved 0 / pilot 48 / draft 2 |
| Routable user-facing Skills | **49** + `step-router` |
| มีไฟล์ eval ครบ 4 มิติ (`evals/skills/`) | **6** |
| มีตัวอย่างคำตอบที่ดีใน `examples/` | **7** (6 Skill ที่มี eval ครบ และ `tor-government-writing` ที่มีตัวอย่าง TOR อยู่ก่อนแล้ว) |
| อยู่ในรายการหนี้ `legacyWithoutEvals` | **43** |
| อยู่ใน model-side benchmark `pilot-30-v1` | **26** |

- `approvedBy` คือบทบาทที่ต้องอนุมัติ ไม่ใช่หลักฐานว่าอนุมัติแล้ว
- draft 2 ตัวคือ `browser-form-assistant` และ `stakeholder-questionnaire` (Skill ใหม่รอบนี้)
- Skill ในรายการหนี้ส่วนใหญ่มี routing regression อยู่แล้ว แต่ยังไม่มีหลักฐานครบ 4 มิติ

Machine-readable source: `manifest/skill-evals.json`

## Skill ที่มี eval ครบ 4 มิติ

| Skill | สิ่งที่คำตอบแบบไม่มี Skill มักพลาด |
| --- | --- |
| `meeting-summary` | ปนมติกับข้อเสนอ และเติมผู้รับผิดชอบหรือกำหนดส่งที่บันทึกไม่ได้ระบุ |
| `step-writing` | เติมวัน เวลา สถานที่ที่ต้นทางไม่มี |
| `thai-official-documents` | ขาดส่วนประกอบตามงานสารบรรณ และแต่งเลขที่หนังสือหรือผู้ลงนาม |
| `hr-policy-lookup` | ตอบจากกฎหมายแรงงานทั่วไป ไม่ใช่ประกาศของ STeP และไม่อ้างเลขข้อ |
| `document-review` | ไม่แยกสิ่งที่ผู้ใช้ต้องแก้เองออกจากสิ่งที่ต้องถามเจ้าของเรื่อง |
| `stakeholder-questionnaire` | ถามหลายเรื่องในข้อเดียว และไม่บอกผู้รับว่าคำตอบจะใช้ทำอะไร |

ยังไม่ได้รันการเทียบแบบมี Skill กับไม่มี Skill บนโมเดลจริง (`baseline.modelSideRun: not-yet-run`)

## สิ่งที่ eval รอบนี้จับได้

การเขียน eval ก่อนเขียนตัวอย่างเจอปัญหาจริงสองจุด และแก้แล้วในรอบเดียวกัน:

1. "ค่ารักษาพยาบาลเบิกได้ปีละเท่าไหร่" หลุดไปโหมด `GENERAL` ซึ่งจะตอบจากความรู้ทั่วไป แก้โดยเพิ่ม trigger ให้ `hr-policy-lookup` และให้คำถามเรื่องเบิก สวัสดิการ เงินเดือน หรือสิทธิ์ไม่เข้า `GENERAL`
2. "ร่างหนังสือแจ้งมติที่ประชุมถึงหน่วยงานภายนอก" ถูกถามกลับ แทนที่จะไป `thai-official-documents`

## ลำดับถัดไป

ย้าย Skill ออกจากรายการหนี้ทีละกลุ่ม เริ่มจากที่ใช้บ่อยและเสี่ยงสูง:

1. `receipt-audit`, `tor-review`, `afp-operations-lookup` — เรื่องเงินและจัดซื้อ
2. `data-privacy-compliance`, `evidence-before-approval` — Skill ด้านความปลอดภัย
3. `project-plan`, `executive-status-update`, `decision-memo` — งานวางแผนที่ใช้บ่อย

แต่ละตัวต้องเริ่มจากเคสที่พลาดจริง ไม่เขียน eval ให้ผ่านอย่างเดียว
