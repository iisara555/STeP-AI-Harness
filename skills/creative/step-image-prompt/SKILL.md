---
name: step-image-prompt
standardVersion: 3
description: เปลี่ยนวัตถุประสงค์ เนื้อหา บริบท และภาพอ้างอิงให้เป็น Prompt Spec และ rendered prompt สำหรับสร้างหรือแก้ภาพ AI โดยรักษาข้อเท็จจริง reference และ brand constraints
---

# STeP Image Prompt

## Purpose

เปลี่ยน Visual Intent + Context + Reference ให้เป็น **Prompt Spec → Rendered Prompt** โดยใช้ **Prompt Spec เป็น source of truth** สำหรับการปรับแก้หรือสลับเครื่องมือ และไม่สร้าง Logo, Claim, Metric หรือข้อเท็จจริงของ STeP ที่ไม่มีหลักฐาน

## เมื่อควรใช้

- ขอ prompt ภาพ / รูป / โปสเตอร์ / งานสัมมนา หรือ key visual จาก brief
- แปลง reference image เป็น prompt โดยไม่ลอก identity ทั้งหมด หรือทำภาพแก้ไข (inpaint / preserve structure)
- ทำชุดภาพที่ต้องคุม Brand Strength และอารมณ์ให้สอดคล้องกัน

**Anti-trigger:**
- วาง Creative Direction กว้าง ๆ ก่อนเขียน prompt → `creative-art-director`
- วางโครง Presentation หลายหน้า → `presentation-design`
- ตรวจ Brand compliance อย่างเป็นทางการ → `step-brand` / `brand-tone-of-voice`
- เตรียม Designer Brief ของชิ้นงานผลิต → `designer-brief`

## Inputs

- ข้อมูลขั้นต่ำ: `SUBJECT` หรือ visual subject จาก brief และเป้าหมายภาพที่พอเลือก composition/style
- ข้อมูลเสริม: Purpose/Audience/Channel, Reference image, Aspect ratio, Fixed/Preserve items, สิ่งที่ห้ามเกิด
- ถามเพิ่มเฉพาะข้อมูลที่ขาดและมีผลต่อ Spec จริง ห้ามถามซ้ำเมื่อมีข้อมูลอยู่แล้ว

## Source

1. brief / reference / image ที่ผู้ใช้ให้ในงานปัจจุบัน
2. `references/prompt-patterns.md` — pattern ตาม use case หลัก (ไม่ใช่สำเร็จรูป ต้องเติมข้อมูลจริง)
3. `references/prompt-spec.md` — schema 14 ช่อง และ renderer contract
4. `references/brand-visual-context.md` — STeP Brand CI ที่มีหลักฐานใน repo (`manifest/documents.yaml` → `step-brand-ci-guideline`)
5. `references/model-families.md` — ตารางเทียบเครื่องมือปัจจุบัน (ทบทวน 2026-09-20; **ห้าม hard-code ชื่อรุ่นโมเดลเป็น Capability Gate**)
6. `references/visual-direction-vocabulary.md` และ `references/syntax-family-guide.md`

- ใช้เฉพาะ brand context ที่ผู้ใช้ให้หรือ Official Asset ที่ resolve ได้ ห้ามสร้าง hex, logo geometry หรือ safe-area rule จากความจำ

## Workflow

ดำเนินงานแบบ **Capability Gate** + **Build Prompt Spec → Confirm Family → Render**:
1. **Identify Intent & Fixed vs Flexible:** แยก Subject/Asset/Angle ที่ต้องล็อกออกจาก Lighting/Mood/Texture ที่ยืดหยุ่นได้ และเทียบ `references/prompt-patterns.md`
2. **Reference & Brand Context:** แยก reference เป็น `Keep / Adapt / Avoid` และคุม CI ผ่าน `references/brand-visual-context.md` (ใช้คำบรรยายสีใน `PALETTE` เฉพาะจุด accent 1 สี; เว้น `TEXT_SPACE` ≥ 30% และใส่โลโก้/ข้อความไทยใน `EXCLUDE`)
3. **Capability Gate (ระบุ syntax family ก่อน render):**
   - `Family A — Natural-language` · `Family B — Tag + weight` · `Family C — Parameter-flag` · `Family D — Edit / inpaint`
   - หากไม่ทราบ family ใช้ Family A ชั่วคราวพร้อมแจ้ง assumption; ห้ามเดา family จากชื่อเครื่องมือที่ไม่รู้จัก
   - กรณี **Reference-Led / Edit** ต้องยืนยันว่า **เครื่องมือปลายทางรับ image input ได้จริง** ถ้าไม่รองรับให้ใช้ Text-Only Prompt และ **ห้ามทำเหมือนระบบเห็นภาพที่ไม่ได้รับมา**
4. **Build Prompt Spec → Confirm Family → Render:** สร้าง Spec 14 ช่อง (`SUBJECT / ACTION / SETTING / SHOT / PLACEMENT / TEXT_SPACE / RATIO / LIGHT / MEDIUM / STYLE / PALETTE / MUST_KEEP / CHANGE_ONLY / EXCLUDE`) แล้ว render ตาม family (Family B ส่ง **ratio handoff** / width × height แยก; Family D เริ่มด้วย `MUST_KEEP` ก่อน `CHANGE_ONLY`; การแก้ไขทุกครั้งต้องแก้ที่ Spec ก่อน render ใหม่)

## Output

แสดงผลพร้อมใช้ (ไม่แสดง checklist ภายใน):
- `Prompt Spec` (แสดง field ที่ใช้จริง)
- `Rendered Prompt` พร้อม metadata สั้น เช่น `Renderer: A · Ratio: 16:9` (Family B แยก Positive/Negative และ ratio handoff; Family D แยก `MUST_KEEP`, `CHANGE_ONLY` และคำสั่ง edit)
- ดูตัวอย่างผลลัพธ์มาตรฐานได้ที่ `examples/good-image-prompt.md`

## Authority

- **AI ช่วยได้:** สร้าง Visual Direction, Prompt Spec และ rendered prompt จากข้อมูลผู้ใช้
- **AI ห้ามและต้องให้มนุษย์ตัดสิน (`human-approval-rule`):** ไม่รับรองว่า generated image เป็นภาพเหตุการณ์/สถานที่จริง; ไม่อนุมัติ Brand/CI change; ไม่สร้าง official logo; ไม่รับรอง technical claim, award หรือ metric; การเผยแพร่สื่อองค์กรต้องให้เจ้าของงานอนุมัติจริง

## Handoff

- Brand compliance / CI governance → `step-brand` · น้ำเสียงข้อความ → `brand-tone-of-voice`
- วาง Deck หลายหน้า → `presentation-design` · ทำ Creative Brief → `designer-brief`
- ข้อมูลมี Claim ยังไม่ยืนยัน → source owner · มี PII/ข้อมูลลับ → `data-privacy-compliance`

## Guardrails

- ห้ามสร้าง Logo STeP / CMU เอง ห้ามสร้าง Fact/Claim/Metric และห้ามยัดสีเหลืองเป็นสีพื้น
- ห้ามให้โมเดลเขียนข้อความภาษาไทยลงภาพเป็นค่าเริ่มต้น ให้เว้น `TEXT_SPACE` ไปวางจริงในขั้นออกแบบ
- ห้าม hard-code ชื่อรุ่นโมเดลเป็น Capability Gate และห้าม patch rendered prompt โดยไม่แก้ Prompt Spec
- ห้ามเปลี่ยน Reference เป็น Requirement ทั้งหมด และห้ามอ้าง `preserve 100%` เมื่อเครื่องมือรับประกันไม่ได้
- ภาพจำลองที่อาจเข้าใจผิดว่าเป็นของจริง ต้องเสนอป้าย `Concept Image`, `ภาพจำลอง`, หรือ `Artist Impression`

## Environment

- ใช้งานได้ทั้ง STeP Desktop และ Claude plugin ร่วมกับเอกสารใน `references/` (`prompt-spec.md`, `prompt-patterns.md`, `brand-visual-context.md`, `model-families.md`, `visual-direction-vocabulary.md`, `syntax-family-guide.md`) และ `examples/good-image-prompt.md`
- ไม่ต้องใช้ API ภายนอกตอนสร้าง Prompt Spec (pattern library เป็น offline reference)

## Pitfalls

- เอาข้อความไทยหรือโลโก้เข้าไปใน rendered prompt แล้วตัวอักษรเพี้ยน/โลโก้ผิด CI → เว้น `TEXT_SPACE` และคงไว้ใน `EXCLUDE` เสมอ
- ปรับแก้คำใน rendered prompt เฉพาะหน้าแล้วลืมอัปเดต Prompt Spec → ทำให้รอบแก้ไขถัดไปหรือการสลับเครื่องมือหลุด Spec
- ใช้ Family D — Edit / inpaint ทั้งที่เครื่องมือปลายทางรับภาพเข้าไม่ได้ → ต้องเช็ก Capability Gate ทุกครั้ง

## Verification

- ตรวจด้วย `node scripts/validate-repo.js` (Standard v3, ไม่มี emoji) และผ่าน `reviewPack()`
- ตรวจใน `test/pilot-readiness.test.js` (Capability Gate, Spec-first rendering, pattern/brand contract) และ `evals/skills/step-image-prompt.json` ผ่าน `npm test`
- ก่อนนำไปใช้สื่อสารจริง ต้องตรวจข้อเท็จจริงและ CI asset กับเจ้าของงาน/CC

## Maintenance

อัปเดตล่าสุด: 2026-11-25

- เจ้าของเนื้อหา: ทีม CC (`manifest/skills.yaml`, stage `pilot`)
- แก้ Skill นี้เมื่อ Family syntax, ตาราง `references/model-families.md`, หรือ `references/brand-visual-context.md` เปลี่ยน แล้วอัปเดตวันที่ข้างต้นทันที
