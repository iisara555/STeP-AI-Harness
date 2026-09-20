# STeP Skill Authoring Standard

สถานะ: Pilot governance standard สำหรับการสร้างและปรับ Skill ใน STeP AI Harness

## หลัก

1. ตรวจของเดิมก่อนสร้างใหม่
2. Skill = atomic reusable capability; Playbook = composite flow; Rule = cross-cutting rule; Registry = changing organization knowledge; Action = side effect
3. `name` + `description` เป็น routing metadata จึงต้องระบุ trigger ชัดและไม่กว้างเกินไป
4. SKILL.md ใช้ progressive disclosure: core สั้นพอใช้งาน รายละเอียดไป references/scripts/templates/assets
5. Mutable rule/fact ต้อง resolve จาก Controlled Source ไม่ hard-code เป็น current truth ใน Skill
6. ทุก Skill ต้องมี Source, Authority และ Handoff boundary ตามความเสี่ยง
7. ก่อน Promote ต้องมี eval อย่างน้อย positive / anti-trigger / collision / missing-source ตามความเกี่ยวข้อง
8. `approvedBy` ระบุ **บทบาทที่ต้องอนุมัติ** ไม่ใช่หลักฐานว่าอนุมัติแล้ว; `stage: approved` ต้องมี explicit owner-review evidence ที่ตรวจย้อนหลังได้

## Flow

```text
Need
 ↓
Skill / Playbook / Rule / Registry / Action?
 ↓
Baseline
 ↓
Author Skill Contract
 ↓
Registry + Router + Sources
 ↓
Routing / Collision / Source / Authority tests
 ↓
Evidence Review
 ↓
Pilot
```

รายละเอียดเชิงปฏิบัติอยู่ที่ `skills/common/step-skill-authoring/`.

## Skill Standard v2 — โครงบังคับสำหรับ Skill ใหม่

Skill ใหม่ตั้งแต่ Standard v2 ต้องใส่ `standardVersion: 2` ใน frontmatter และมีหัวข้อระดับ `##` ครบ 9 หัวข้อ:

1. `Purpose`
2. `เมื่อควรใช้`
3. `Inputs`
4. `Source`
5. `Workflow`
6. `Output`
7. `Authority`
8. `Handoff`
9. `Guardrails`

หลักการ:

- Legacy Skill ที่ยังไม่มี `standardVersion` **ยังไม่ทำให้ CI แดง** เพื่อให้ migrate แบบ incremental
- Skill ใหม่ต้องใช้ v2 ทันที
- `Source` ถ้าไม่ต้องใช้ external source ให้เขียนว่าไม่มี source ภายนอกที่จำเป็นอย่างชัดเจน
- `Authority` ต้องแยกสิ่งที่ AI ช่วยได้ อะไรต้องยืนยัน และอะไรเป็นอำนาจมนุษย์
- `Handoff` ต้องระบุปลายทางหรือเกณฑ์ว่าเมื่อไรงานพร้อมส่งต่อ
- ขนาดไฟล์ไม่ใช่ quality gate โดยตัวมันเอง แต่ core contract ควรสั้นและ predictable; methodology/template ที่ยาวให้ย้ายไป references/scripts/templates ตาม Progressive Disclosure

