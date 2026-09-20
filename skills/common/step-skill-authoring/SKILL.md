---
name: step-skill-authoring
description: ใช้เมื่อผู้ใช้ต้องการสร้าง ปรับ หรือยกระดับ Skill ของ STeP AI Harness ให้เข้ากับบริบทองค์กร; ตรวจก่อนว่าโจทย์ควรเป็น Skill, Playbook, Rule, Registry/Source หรือ Action และไม่ใช้เพื่ออนุมัติ Skill เข้าสู่ Pilot โดยไม่มีการทดสอบและหลักฐาน
---

# STeP Skill Authoring

Skill นี้เป็นมาตรฐานกลางสำหรับออกแบบหรือปรับ Skill ของ STeP AI Harness โดยยึด **ของที่มีอยู่จริงใน repo ก่อน** และไม่สร้าง Skill ใหม่เพียงเพราะมีคำขอใหม่หนึ่งครั้ง

> **Create the smallest reusable capability that solves repeated work.**

## 1. Need Gate — ต้องเป็น Skill จริงหรือไม่

ก่อนเขียนไฟล์ ให้จัดประเภทความต้องการ:

| สิ่งที่ต้องการ | ควรเป็น |
|---|---|
| ความสามารถเฉพาะงานที่ใช้ซ้ำ | **Skill** |
| งานหลายขั้นที่เรียงหลาย Skill | **Playbook** |
| กฎ/ข้อห้ามที่ทุก Skill ต้องเคารพ | **Rule / Authority** |
| ข้อมูลบริการ ทีม Source หรือรายการที่เปลี่ยนได้ | **Registry / Controlled Source** |
| การลงมือทำกับระบบจริงและมี side effect | **Action / Tool** |

หากของเดิมทำได้อยู่แล้ว ให้ปรับ Skill/Router/Source เดิมก่อนสร้างใหม่

## 2. Inspect Current Harness

ก่อนแก้ ต้องอ่านอย่างน้อย:
- Skill ที่ใกล้เคียง
- `manifest/skills.yaml`
- `manifest/router-index.yaml`
- Process / Service / Document / Authority ที่เกี่ยวข้อง
- Playbook ที่อาจชนกัน
- Tests/Evals ที่มีอยู่

ห้ามคาดเดาจำนวน Skill, team id, process id หรือ source status จากความจำ

## 3. Skill Contract

Skill ใหม่หรือ Skill ที่ปรับอย่างมีนัยสำคัญต้องตอบได้:

1. **Trigger** — ใช้เมื่ออะไร
2. **Anti-trigger** — เมื่อไรไม่ควรใช้ และควรส่งไปไหน
3. **Inputs** — ข้อมูลขั้นต่ำที่ต้องมี
4. **Method** — ขั้นตอน/หลักการที่ทำซ้ำได้
5. **Output Contract** — ผลลัพธ์ต้องมีอะไร
6. **Source Contract** — Facts/Rules มาจากไหน และ freshness อย่างไร
7. **Authority Boundary** — AI ห้ามตัดสินอะไร
8. **Handoff** — ส่งต่อ Skill/Playbook ไหน
9. **Tool Boundary** — อะไรเป็น reasoning และอะไรต้องเป็น Action
10. **Eval Contract** — positive / anti-trigger / collision / missing-source
11. **Context Budget** — อะไรอยู่ Core และอะไรย้ายไป references/scripts/templates/assets
12. **Lifecycle** — draft → pilot → approved → deprecated

รายละเอียดมาตรฐาน: [skill-contract.md](references/skill-contract.md)

## 4. Trigger Metadata & Standard v2

Skill ใหม่ต้องใช้ frontmatter:
- `name`
- `description`
- `standardVersion: 2`

และต้องมี section ระดับ `##` ครบ 9 หัวข้อ:

`Purpose → เมื่อควรใช้ → Inputs → Source → Workflow → Output → Authority → Handoff → Guardrails`

Legacy Skill ที่ยังไม่มี `standardVersion` ให้ migrate แบบ incremental เมื่อมีการแก้เชิงสาระหรือเป็นกลุ่มความเสี่ยงสูง ไม่ต้องแก้ทั้ง repository พร้อมกัน

`description` ต้องบอกให้ชัด:
- **เมื่อไรควร Trigger**
- **ขอบเขตหลัก**
- **เมื่อไรไม่ควร Trigger** หากมี collision สำคัญ

อย่าใช้ description ที่กว้าง เช่น “ช่วยงานโครงการ” หรือ “จัดการเอกสาร”

## 5. Progressive Disclosure

`SKILL.md` เก็บเฉพาะ routing contract + core workflow + guardrails ที่ต้องใช้เกือบทุกครั้ง

ย้ายรายละเอียดที่ยาวหรือเฉพาะกรณีไป:
- `references/` — วิธีอ้างอิง/ความรู้รายละเอียด
- `scripts/` — งาน deterministic ที่ควรรันซ้ำ
- `templates/` หรือ `assets/` — แม่แบบ/ทรัพยากร

ห้ามฝังกฎที่เปลี่ยนได้ เช่น ราคา เพดาน อัตรา แบบฟอร์ม revision หรือ current policy ไว้เป็น truth ถาวรใน SKILL.md; ให้ resolve จาก Controlled Source

## 6. Baseline → Change → Eval

ก่อนปรับ Skill เดิม:
1. บันทึกตัวอย่างที่ปัจจุบันทำผิด/ไม่พออย่างน้อย 1 เคส
2. ระบุ expected behavior
3. แก้ให้น้อยที่สุด
4. ทดสอบ routing + anti-collision + authority/source behavior
5. ตรวจ regression ของ Skill ใกล้เคียง

สำหรับ Skill ใหม่ ต้องมีอย่างน้อย:
- Positive case
- Anti-trigger / negative case
- Collision case กับ Skill ใกล้เคียง
- Missing-source / uncertainty case เมื่อ Skill พึ่ง Source

## 7. Output Package

เมื่อผู้ใช้ขอ “ออกแบบ Skill” ให้ส่ง:
- Need classification
- Proposed name + trigger/anti-trigger
- SKILL.md draft
- Registry/Router changes ที่ต้องมี
- Source/Authority/Handoff mapping
- Eval cases
- Risks / unknowns

เมื่อผู้ใช้ขอ “ลง repo / ทำให้พร้อม Pilot” ให้ใช้ Playbook `skill-to-pilot` และทำงานผ่าน workflow ของ repo; ห้าม claim ว่าพร้อม Pilot จน validation/evidence ผ่าน

## Guardrails

- ไม่สร้าง Process/Layer/Dimension ใหม่หาก registry เดิมรองรับได้
- ไม่ copy third-party Skill แบบ verbatim; ใช้ methodology แล้วเขียนใหม่ให้เข้ากับ STeP
- ไม่แต่ง Source of Truth หรือ Authority
- ไม่เปลี่ยน `approved` lifecycle เองเพียงเพราะไฟล์สร้างเสร็จ
- ไม่ Merge เมื่อ dependency/test ที่เกี่ยวข้องล้มเหลว
- งานที่มี external side effect ต้องใช้ Action/Tool gate ของ Harness
