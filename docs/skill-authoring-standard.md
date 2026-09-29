# STeP Skill Authoring Standard

สถานะ: Pilot governance standard สำหรับการสร้างและปรับ Skill ใน STeP AI Harness

## หลัก

1. ตรวจของเดิมก่อนสร้างใหม่
2. Skill = atomic reusable capability; Playbook = composite flow; Rule = cross-cutting rule; Registry = changing organization knowledge; Action = side effect
3. `name` + `description` เป็น routing metadata จึงต้องระบุ trigger ชัดและไม่กว้างเกินไป
4. SKILL.md ใช้ progressive disclosure: core สั้นพอใช้งาน รายละเอียดไป references/scripts/templates/assets
5. Mutable rule/fact ต้อง resolve จาก Controlled Source ไม่ hard-code เป็น current truth ใน Skill
6. ทุก Skill ต้องมี Source, Authority และ Handoff boundary ตามความเสี่ยง
7. ก่อน Promote ต้องมี eval ครบ positive / anti-trigger / collision / missing-source ใน `evals/skills/<skill>.json` และตัวอย่างคำตอบที่ดีใน `examples/` (ดูหัวข้อ Eval และตัวอย่างด้านล่าง)
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

### ข้อยกเว้นที่บันทึกไว้

- `skills/common/step-router` **ไม่ต้องใช้โครง v2** เพราะไม่ใช่ Skill ปลายทางที่ Router เลือก แต่เป็นสเปกอัลกอริทึมการจัดเส้นทางของตัว Router เอง การยัดหัวข้อ Inputs/Output/Handoff แบบ Skill ทั่วไปจะบิดความหมายของเอกสาร
- ข้อยกเว้นต้องบันทึกที่นี่เท่านั้น Skill อื่นทุกตัวใน `skills/` ต้องเป็น v2
## Eval และตัวอย่าง — บังคับใน CI

Skill ใหม่ทุกตัวต้องมีก่อน merge:

1. `evals/skills/<skill>.json` ที่มีเคสครบ 4 มิติ: `positive`, `antiTrigger`, `collision`, `missingSource`
   - `positive` และ `missingSource` ต้องมี `outputAssertions` ที่ตรวจได้จริงจากคำตอบ
   - บันทึกใน `baseline.withoutSkillTypicallyMisses` ว่าคำตอบแบบไม่มี Skill พลาดตรงไหน ถ้าบอกไม่ได้ อาจยังไม่ต้องมี Skill นี้
2. โฟลเดอร์ `examples/` ที่มีตัวอย่างคำตอบที่ดีพร้อมเหตุผล ใช้ข้อมูลสังเคราะห์ และเชื่อมจากหัวข้อ `Output`

`test/skill-evals.test.js` รันส่วน routing ของทุกเคส และตรวจว่า Skill ที่ไม่อยู่ในรายการหนี้มีทั้ง eval และ `examples/`
ส่วน `outputAssertions` ใช้ตรวจคำตอบของโมเดลแบบมี Skill เทียบกับไม่มี Skill ซึ่ง CI ไม่ได้รัน ผลการตรวจให้บันทึกใน `baseline.modelSideRun`

### รายการหนี้ `legacyWithoutEvals`

Skill ที่ถึง `pilot` ก่อนมีกลไกนี้อยู่ใน `legacyWithoutEvals` ของ `manifest/skill-evals.json`

- รายการนี้**ลดได้อย่างเดียว** เพิ่ม eval ให้ Skill ใดต้องลบออกจากรายการในการเปลี่ยนแปลงเดียวกัน
- Skill ใหม่เข้ารายการนี้ไม่ได้ และ test ล้มถ้ารายการยาวเกิน `legacyCeiling`
- การอยู่ในรายการไม่ได้แปลว่า Skill นั้นไม่มี test เลย หลายตัวมี routing และ authority regression อยู่แล้ว แต่ยังไม่มีหลักฐานครบ 4 มิติตามข้อ 7

วิธีเขียน eval และ assertion ที่แยก Skill ออกจาก baseline ได้: `skills/common/step-skill-authoring/references/eval-and-baseline.md`

## Lifecycle

| Stage | ต้องมี |
| --- | --- |
| `draft` | Skill Contract และ registry ครบ ยังไม่แนะนำให้ใช้งานจริง |
| `pilot` | registry/router integrity, source/authority mapping และ eval ครบ 4 มิติที่ผ่าน routing |
| `approved` | หลักฐานการทบทวนจากเจ้าของที่ตรวจย้อนได้ นอกเหนือจาก `approvedBy` ซึ่งเป็นเพียงบทบาทที่ต้องอนุมัติ |

Skill ใหม่เริ่มที่ `draft` เสมอ การเลื่อนขั้นเป็นการตัดสินใจของเจ้าของ Skill ไม่ใช่ผลอัตโนมัติจากการที่ test ผ่าน

## วิธีการจากชุมชน

แนวทาง eval, การเขียนเพื่อ agent และ Skill `stakeholder-questionnaire` ดัดแปลงจาก Skill ของชุมชนที่ license อนุญาต ดูที่มาและเหตุผลที่ไม่นำบางตัวมาใช้ใน [third-party-methods.md](third-party-methods.md)

## Router consumer scope

- `teams.consumers` ระบุทีมที่ควร preload Skill เข้า team workspace; ไม่ใช่รายชื่อทุกทีมที่อาจเป็น subject ของกระบวนการ
- ใช้ `consumers: ["*"]` เฉพาะ capability ที่เป็นงานประจำข้ามองค์กรจริง เช่น document review, privacy, meeting, writing
- ทุก wildcard ต้องมี `wildcardReason` ใน Router Registry; validator จะ reject wildcard ที่ไม่มีเหตุผล
- Specialist/QMS Skill ให้ primary owner ถือเป็น baseline และเพิ่ม consumer แบบ explicit เมื่อมี usage evidence; ทีมอื่นยัง route เข้า Skill ได้เมื่อคำขอมี trigger ชัด

