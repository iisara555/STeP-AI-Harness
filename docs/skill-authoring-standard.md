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
