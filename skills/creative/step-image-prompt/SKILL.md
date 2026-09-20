---
name: step-image-prompt
standardVersion: 2
description: เปลี่ยนวัตถุประสงค์ เนื้อหา บริบท และภาพอ้างอิงให้เป็น Prompt Spec และ rendered prompt สำหรับสร้างหรือแก้ภาพ AI โดยรักษาข้อเท็จจริง reference และ brand constraints
---

# STeP Image Prompt

## Purpose

เปลี่ยน Visual Intent + Context + Reference ให้เป็น **Prompt Spec → Rendered Prompt** ที่นำไปใช้กับเครื่องมือสร้างหรือแก้ภาพได้โดยไม่ผูกกับชื่อรุ่น

หลัก:
- **Prompt Spec เป็น source of truth** สำหรับ revision และ tool-switch
- syntax ของปลายทางเป็น renderer concern ไม่ใช่เนื้อหาภาพ
- Consistent brand, not consistent-looking images
- ไม่สร้าง Logo, Claim, Event, Metric หรือข้อเท็จจริงของ STeP ที่ไม่มี source

## เมื่อควรใช้

ใช้เมื่อผู้ใช้ต้องการ:
- ขอ prompt ภาพ / prompt รูป / prompt โปสเตอร์ / prompt งานสัมมนา
- สร้าง Art Direction หรือ Visual Direction
- สร้างภาพใหม่จาก brief
- แปลง reference image เป็น prompt โดยไม่ลอกทุกอย่าง
- แก้ภาพเดิม / inpaint / preserve structure
- ทำภาพเป็นชุดที่ต้องคุม style ให้สม่ำเสมอ

ไม่ใช้เมื่อ:
- ต้องออกแบบ layout/presentation ทั้งระบบ → `presentation-design`
- ต้องตรวจ Brand compliance อย่างเป็นทางการ → `step-brand` / `brand-tone-of-voice`
- ต้องสร้าง Designer Brief ก่อนเริ่มงาน → `designer-brief`

## Inputs

ข้อมูลที่อาจได้รับ:
- คำอธิบายภาพหรือ Project/Campaign brief
- Purpose / Audience / Channel
- Reference image หรือ existing image
- Format / Aspect ratio
- สิ่งที่ต้องมี
- สิ่งที่ต้องรักษา
- สิ่งที่ห้ามเกิด

ข้อมูลขั้นต่ำ:
- `SUBJECT` หรือ visual subject ที่ตีความได้จาก brief
- เป้าหมายของภาพที่ชัดพอจะเลือก composition/style

ถามเพิ่มเฉพาะข้อมูลที่ขาดและมีผลต่อผลลัพธ์จริง ห้ามถามซ้ำเมื่อมีข้อมูลอยู่แล้ว

## Source

ใช้ source ตามลำดับ:
1. brief / reference / existing image ที่ผู้ใช้ให้ในงานปัจจุบัน
2. `references/prompt-patterns.md` สำหรับ pattern ตาม use case ที่ STeP ทำบ่อย
3. `references/prompt-spec.md` สำหรับ schema และ renderer contract
4. `references/brand-visual-context.md` สำหรับ STeP Brand CI ที่มีหลักฐานใน repo
5. `references/model-families.md` เมื่อต้องจับคู่เครื่องมือปลายทางกับ syntax family
6. `references/visual-direction-vocabulary.md` เมื่อจำเป็นต้องเลือกหรือขยาย Art Direction

สถานะ Brand ปัจจุบันต้องตรวจจาก `references/brand-visual-context.md` ซึ่งเชื่อมไปยัง CI Manual Digest ที่ผู้ใช้ให้และคำยืนยันสีดิจิทัล
สถานะฉบับควบคุมปัจจุบันและประเด็นที่ยังไม่ยืนยันลงทะเบียนไว้ที่ `manifest/documents.yaml` → `step-brand-ci-guideline`

สำหรับประเด็นที่ source ยังไม่ครอบคลุมหรือขัดกัน:
- ใช้เฉพาะ brand context ที่ผู้ใช้ให้หรือ Official Asset ที่ resolve ได้
- ห้ามสร้าง hex, logo geometry, co-branding rule หรือ safe-area rule จากความจำ

## Capability Gate

ก่อน render ให้ระบุ syntax family ของเครื่องมือปลายทาง:

- **Family A — Natural-language**
- **Family B — Tag + weight**
- **Family C — Parameter-flag**
- **Family D — Edit / inpaint**

รายละเอียด syntax ของแต่ละ family: `references/prompt-spec.md`
ตารางจับคู่เครื่องมือปัจจุบันกับ family (ทบทวน 2026-09-20): `references/model-families.md`

หากผู้ใช้ไม่ทราบ family:
- ใช้ Family A ชั่วคราว
- แจ้ง assumption สั้น ๆ
- render ใหม่ได้ภายหลังโดยใช้ Spec เดิม

ห้ามเดา family จากชื่อเครื่องมือที่ไม่รู้จัก ให้ถามรูปแบบการเขียน prompt แทน

กรณี **Reference-Led / Edit** ต้องยืนยันว่าเครื่องมือปลายทางรับ image input ได้จริง ถ้าไม่รองรับให้เปลี่ยนเป็น Text-Only Prompt และ **ห้ามทำเหมือนระบบเห็นภาพที่ไม่ได้รับมา**

## Workflow

### 1. Identify Visual Intent
ระบุ:
- สร้างหรือแก้ภาพอะไร
- ใช้เพื่ออะไร
- ผู้ชม/ช่องทาง
- format / ratio
- must-have / preserve / reference

### 2. Separate Fixed vs Flexible

**Fixed**
- subject identity
- product/architecture structure
- camera angle/layout ที่ผู้ใช้ล็อก
- official asset
- copy/object ที่ต้องมี

**Flexible**
- lighting
- mood
- texture
- visual treatment
- supporting element
- decorative detail

ถ้าไม่แน่ใจให้รักษาสิ่งเดิมก่อน

### 2.5 Pick a Pattern

เทียบ use case กับตารางใน `references/prompt-patterns.md` แล้วเลือก pattern ที่ตรงที่สุด

- pattern บอกว่าอะไรต้องล็อก อะไรปล่อยได้ และอะไรต้องกัน จึงใช้เป็นโครงของ Spec ได้ทันที
- pattern ไม่ใช่ prompt สำเร็จรูป ต้องเติม subject และข้อจำกัดของงานจริงเสมอ
- ถ้าไม่ตรง pattern ใด ให้สร้าง Spec จากศูนย์และแจ้งผู้ใช้ว่าไม่ได้ใช้ pattern

### 3. Define Art Direction
เลือก direction จาก purpose/audience/medium

โหลด `references/visual-direction-vocabulary.md` เฉพาะเมื่อจำเป็น

### 4. Handle Reference
Reference image ให้แยก:
- Keep
- Adapt
- Avoid

Reference ไม่ใช่ Requirement ทั้งหมดโดยอัตโนมัติ

### 5. Apply Brand Context
ใช้ `references/brand-visual-context.md`

- `PALETTE` ใช้ **คำบรรยายสี** เป็นค่าเริ่มต้น เช่น warm amber accent บน deep charcoal slate; ใส่ hex เฉพาะเมื่อปลายทางเป็นงาน design ไม่ใช่ prompt ภาพ
- accent เป็นจุดเน้นเดียวต่อเฟรม ไม่ใช่สีพื้น การยัดเหลืองทั้งภาพไม่ใช่การทำตาม CI
- ค่านิยม SIMPLE / SERVICE / SINCERE แปลงเป็นข้อกำหนดของภาพ: พื้นที่ว่างอย่างน้อย 30%, อ่านง่ายสำหรับผู้รับสารจริง, ไม่ทำให้เข้าใจผิดว่าเป็นเหตุการณ์จริง
- ข้อความภาษาไทยในภาพเป็น `EXCLUDE` โดยค่าเริ่มต้น ให้เว้น `TEXT_SPACE` ไว้วางตัวอักษรจริงในขั้นออกแบบ
- Official logo ต้องมาจาก Official Asset และอยู่ใน `EXCLUDE` ของ prompt เสมอ
- AI ไม่สร้างหรือเลียนแบบ STeP / CMU logo
- ไม่ hard-code mutable CI rule ใน Skill นี้ ให้แก้ที่ `references/brand-visual-context.md` เมื่อมี source ใหม่

### 6. Build Prompt Spec → Confirm Family → Render

สร้าง Spec ตาม:
`SUBJECT / ACTION / SETTING / SHOT / PLACEMENT / TEXT_SPACE / RATIO / LIGHT / MEDIUM / STYLE / PALETTE / MUST_KEEP / CHANGE_ONLY / EXCLUDE`

กติกา:
- `SUBJECT` บังคับ
- `ACTION` ระบุเมื่อมีคน/วัตถุที่ควรดูเป็นธรรมชาติ
- `TEXT_SPACE` ระบุพื้นที่จริงของเฟรม
- `PALETTE` ใช้คำบรรยายเป็นค่าเริ่มต้น
- baseline `EXCLUDE` เรื่อง text/logo/anatomy เว้นแต่ผู้ใช้ต้องการสิ่งนั้นจริง
- edit ต้องมี `MUST_KEEP` และ `CHANGE_ONLY`

จากนั้น:
1. ยืนยัน family
2. render จาก Spec
3. Family B ส่ง ratio handoff / width-height แยก
4. Family D เริ่มด้วย `MUST_KEEP` ก่อน `CHANGE_ONLY`
5. revision ต้องแก้ Spec ก่อน render ใหม่

## Output

Default output:

### Prompt Spec
แสดง field ที่ใช้จริงและค่าที่เติม

### Rendered Prompt
แสดง prompt ตาม Family A/B/C/D

metadata สั้น ๆ:
`Renderer: A · Ratio: 16:9`

Family B ต้องมี:
- Positive
- Negative
- Ratio handoff / width × height หรือคำแนะนำให้ตั้งใน UI

Family D ต้องแสดง:
- `MUST_KEEP`
- `CHANGE_ONLY`
- rendered edit instruction

ไม่แสดง chain-of-thought หรือ checklist ภายใน

## Authority

AI ช่วยสร้าง visual direction, Prompt Spec และ rendered prompt ได้ แต่:
- ไม่รับรองว่า generated image เป็นภาพเหตุการณ์/สถานที่จริง
- ไม่อนุมัติ Brand/CI change
- ไม่สร้าง official logo
- ไม่รับรอง technical claim, research result, award, metric หรือ endorsement
- การเผยแพร่สื่อที่มีผลผูกพันกับ CI/องค์กรต้องใช้ human owner ตามกระบวนการจริง

## Handoff

ส่งต่อเมื่อ:
- Brand compliance / CI governance → `step-brand`
- Tone/personality ของข้อความแบรนด์ → `brand-tone-of-voice`
- ต้องวาง presentation/layout หลายหน้า → `presentation-design`
- ต้องสร้าง creative brief → `designer-brief`
- ภาพมี claim/fact ที่ยังยืนยันไม่ได้ → เจ้าของข้อมูล / source owner
- มี PII หรือข้อมูลลับ → `data-privacy-compliance`

## Guardrails

- ห้ามสร้าง Logo STeP / CMU ขึ้นเอง
- ห้ามสร้าง Fact, Metric, Award, Claim, Endorsement หรือ technical specification ที่ไม่มีหลักฐาน
- ห้ามเปลี่ยน Reference เป็น Requirement ทั้งหมดโดยอัตโนมัติ
- ห้ามเปลี่ยนสิ่งที่ผู้ใช้สั่งให้รักษาเพียงเพื่อความสวยงาม
- ห้ามยัด CI ลงทุกภาพ และห้ามใช้ accent เป็นสีพื้นเพื่ออ้างว่าตรง CI
- ห้ามให้โมเดลเขียนข้อความภาษาไทยลงภาพเป็นค่าเริ่มต้น เพราะรูปสระและวรรณยุกต์ยังผิดบ่อย
- ห้ามใช้ตัวเลข กราฟ เปอร์เซ็นต์ หรือหน่วยวัดที่โมเดลสร้างขึ้น
- ห้าม hard-code ชื่อรุ่นโมเดลเป็น Capability Gate
- ห้าม patch rendered prompt เป็น source of truth; ต้องสะท้อนกลับเข้า Prompt Spec
- ห้ามอ้าง `preserve 100%` เมื่อเครื่องมือรับประกัน fidelity ไม่ได้
- ภาพจำลองที่อาจถูกเข้าใจว่าเป็นเหตุการณ์จริง ให้เสนอ label เช่น `Concept Image`, `ภาพจำลอง`, หรือ `Artist Impression`

## Internal Self-Check

ก่อนส่งตรวจ:
- Intent — ตอบวัตถุประสงค์หรือไม่
- Hierarchy — จุดนำสายตาชัดหรือไม่
- Preserve — สิ่งที่ล็อกถูกเก็บครบหรือไม่
- Brand — ใช้ source ที่มีจริงหรือไม่
- Truth — ไม่มี fake logo / fabricated claim หรือไม่
- Spec — Spec ครบ field ที่มีผลต่อภาพหรือไม่
- Renderer — family ตรงกับ syntax หรือเปิดเผย assumption แล้วหรือไม่
- Copy-ready — rendered prompt ใช้งานได้เองหรือไม่
