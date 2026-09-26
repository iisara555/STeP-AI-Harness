# STeP Skill Contract

ใช้เป็น checklist ตอนสร้างหรือ review Skill ไม่จำเป็นต้องยัดทุกหัวข้อลง SKILL.md หากไม่มีประโยชน์ต่อ runtime

## Standard v2 runtime skeleton

Skill ใหม่ต้องประกาศ `standardVersion: 2` และมีหัวข้อ `##` ครบ:

1. Purpose
2. เมื่อควรใช้
3. Inputs
4. Source
5. Workflow
6. Output
7. Authority
8. Handoff
9. Guardrails

หัวข้อเหล่านี้เป็น runtime/review skeleton; รายละเอียด methodology, templates และตัวอย่างยาวให้ย้ายไป references/scripts/templates ตาม Progressive Disclosure

## Required design decisions

| Contract | คำถาม |
|---|---|
| Trigger | คำขอแบบใดควรเลือก Skill นี้ |
| Anti-trigger | งานแบบใดดูคล้ายกันแต่ต้องไม่เลือก |
| Inputs | ข้อมูลขั้นต่ำอะไรที่ต้องมี |
| Method | ขั้นตอนใดทำซ้ำได้และสร้างความสม่ำเสมอ |
| Output | รูปแบบผลลัพธ์ขั้นต่ำคืออะไร |
| Source | Facts/Rules มาจาก source ไหนและ current แค่ไหน |
| Authority | การตัดสินใดต้องคืนให้มนุษย์ |
| Handoff | เมื่อจบ/เกินขอบเขต ส่งต่ออะไร |
| Tool | งานใดต้องใช้ Tool/Action จริง |
| Eval | จะพิสูจน์ว่า Skill ดีกว่า baseline อย่างไร |
| Context | เนื้อหาใดควรอยู่ Core vs reference/script/template |
| Lifecycle | draft / pilot / approved / deprecated |

## Minimum eval set

1. **Positive** — คำขอที่ควร route เข้า Skill และ output หลักต้องครบ
2. **Anti-trigger** — คำขอที่ไม่ควรใช้ Skill นี้
3. **Collision** — คำขอที่ชนกับ Skill ใกล้เคียงและ Router ต้องเลือกถูก
4. **Missing-source** — เมื่อข้อมูล/กฎที่ต้องใช้ไม่มี ต้องเปิดเผย gap ไม่แต่งคำตอบ

เพิ่ม authority/privacy/action cases เมื่อเกี่ยวข้อง

Skill ใหม่เก็บเคสเหล่านี้ใน `evals/skills/<skill>.json` และต้องมีตัวอย่างคำตอบที่ดีใน `examples/` ของ Skill ซึ่ง `test/skill-evals.test.js` บังคับใน CI รายละเอียด: [eval-and-baseline.md](eval-and-baseline.md)

## Promotion rule

`draft → pilot` ต้องมี:
- registry + router integrity
- dependency check
- positive/negative/collision eval อย่างน้อย
- source/authority mapping
- ไม่มี known critical safety issue

`pilot → approved` ต้องมี evidence จาก usage/owner review ตาม governance ของ Skill นั้น

## Progressive disclosure

Core SKILL.md ควรอ่านง่ายและมีเฉพาะสิ่งที่ใช้บ่อย รายละเอียดที่ยาวให้แยก:
- references/
- scripts/
- templates/
- assets/

ทุก local dependency ที่อ้างจาก SKILL.md ต้องมีไฟล์จริงและถูกแจกไปกับ package
## Router consumer-scope rule

- `teams.primary` = owner/primary operator
- `teams.consumers` = teams that should receive the Skill in their normal team scope
- `consumers: ["*"]` is allowed only for genuinely organization-wide routine capabilities and requires `wildcardReason` in `manifest/router-index.yaml`
- Being audited, reviewed, or supplying evidence to a specialist process does **not** by itself make every team a consumer of that specialist Skill

