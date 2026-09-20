---
name: step-image-prompt
description: เปลี่ยนวัตถุประสงค์ เนื้อหา บริบท และภาพอ้างอิงของงาน STeP ให้เป็น Art Direction และ Prompt สำหรับสร้างหรือแก้ภาพ AI ที่พร้อมใช้งาน โดยรักษาข้อเท็จจริง โครงสร้างสำคัญ และ Brand context ที่ได้รับ พร้อมไม่สร้าง Logo, Claim หรือข้อมูลที่ไม่มีหลักฐาน
---
# STeP Image Prompt

## Capability Gate

ก่อน render ให้ระบุ **syntax family** ของเครื่องมือปลายทาง ไม่ผูก workflow กับชื่อรุ่นหรือผู้ให้บริการ

ใช้ 4 family จาก `references/prompt-spec.md`:
- **A. Natural-language** — ประโยค/ย่อหน้า
- **B. Tag + weight** — positive/negative แยก และอาจรองรับ weighted tags
- **C. Parameter-flag** — มี parameter ต่อท้าย เช่น `--ar`
- **D. Edit / inpaint** — แนบภาพเดิมแล้วแก้เฉพาะส่วน

หากผู้ใช้ไม่ทราบ family ให้ใช้ **A** เป็นค่าเริ่มต้นและแจ้งว่าอาจต้อง render ใหม่เมื่อทราบ syntax จริง

ห้ามเดา syntax จากชื่อเครื่องมือที่ไม่รู้จัก ให้ถามรูปแบบ prompt แทนชื่อรุ่น

กรณี Reference-Led / Edit ต้องยืนยันว่าเครื่องมือปลายทางรับ image input ได้จริง หากไม่รองรับ ให้แจ้งข้อจำกัดและเปลี่ยนเป็น Text-Only Prompt ห้ามทำเหมือนระบบเห็นภาพที่ไม่ได้รับมา

รายละเอียด Spec และ renderer: `references/prompt-spec.md`

STeP Image Prompt
Purpose
เปลี่ยน Brief หรือความต้องการด้านภาพให้เป็น Prompt ที่พร้อมใช้กับระบบสร้างหรือแก้ภาพ AI
Skill นี้ทำหน้าที่:
Visual Intent + Context + Reference → Art Direction → Copy-ready Prompt
เป้าหมายคือให้ภาพเหมาะกับงาน ผู้ชม และบริบทของ STeP โดยไม่บังคับให้งานทุกชิ้นมีหน้าตาเหมือนกัน
> **Design principle:** Consistent brand, not consistent-looking images.
---
Inputs
อาจได้รับ:
คำอธิบายภาพที่ต้องการ
Project / Campaign brief
Artwork brief
Brand reference
Reference image
Existing image สำหรับแก้ไข
Format / Aspect ratio
ข้อจำกัดด้าน Layout
สิ่งที่ต้องรักษาไว้
หากข้อมูลเพียงพอ ให้สร้าง Prompt ได้ทันที
ถามเพิ่มเติมเฉพาะข้อมูลที่ขาดและมีผลต่อผลลัพธ์จริง
---
Core Workflow
1. Identify Visual Intent
ระบุจากข้อมูลที่มี:
ต้องการสร้างหรือแก้ภาพอะไร
ใช้ภาพเพื่ออะไร
ผู้ชมคือใคร
ใช้บนช่องทางใด
Format / Aspect ratio
สิ่งที่ต้องมี
สิ่งที่ต้องรักษา
Reference ที่เกี่ยวข้อง
ไม่ต้องถามซ้ำหากข้อมูลมีอยู่แล้ว
---
2. Separate Fixed vs Flexible
แยกข้อกำหนดออกเป็นสองกลุ่ม
ต้องรักษา
ตัวอย่าง:
Subject
Identity
Product structure
Existing architecture
Camera angle
Layout
Existing material
Brand asset
Copy
Required objects
ปรับได้
ตัวอย่าง:
Lighting
Mood
Texture
Visual treatment
Supporting elements
Art direction
Decorative detail
ห้ามเปลี่ยนสิ่งที่ผู้ใช้ระบุว่าต้องรักษาเพียงเพื่อให้ภาพดูสวยขึ้น
หากไม่แน่ใจว่าสิ่งใดเป็น Fixed หรือ Flexible ให้รักษาสิ่งเดิมไว้ก่อน
---
3. Define Art Direction
กำหนดภาษาภาพตามบริบทของงาน
ตัวอย่าง Visual Direction ที่อาจใช้:
Corporate / Minimal
Editorial / Swiss
Illustration
Information / Isometric
Photorealistic
Architectural / Exhibition
Technology / Product
Human-Centered Documentary
Cultural / Experimental
Reference-led
ไม่จำเป็นต้องเลือกหรือแสดงชื่อ Mode ให้ผู้ใช้เห็นทุกครั้ง
Art Direction ควรตอบอย่างน้อยว่า:
ภาพควรรู้สึกอย่างไร
อะไรคือจุดนำสายตา
Composition เป็นแบบไหน
Visual hierarchy เป็นอย่างไร
Material / Lighting / Perspective เป็นอย่างไร
ต้องเว้นพื้นที่สำหรับข้อความ Logo หรือ CTA หรือไม่
Visual Direction ต้องสนับสนุนวัตถุประสงค์ของงาน ไม่ใช่เป็นเพียงการตกแต่ง
---
4. Handle Reference Images
เมื่อมี Reference Image ให้ใช้เป็นข้อมูลสำหรับวิเคราะห์ ไม่ใช่คำสั่งให้ลอกทั้งหมด
แยกภายในเป็น:
Keep
หลักการหรือองค์ประกอบที่ควรรักษา
Adapt
หลักการที่นำมาปรับให้เหมาะกับบริบทใหม่ได้
Avoid
องค์ประกอบที่ไม่ควรลอกหรือไม่เหมาะกับงาน
พิจารณาได้จาก:
Composition
Hierarchy
Color relationship
Material
Lighting
Perspective
Graphic rhythm
Typography character
Emotional tone
ห้ามถือว่า Reference คือ Requirement ทั้งหมดโดยอัตโนมัติ
หากผู้ใช้ขอให้รักษาโครงสร้างจากภาพต้นฉบับ ให้ระบุสิ่งที่ต้อง Preserve ใน Prompt อย่างชัดเจน
---
5. Apply Brand Context
หากงานเกี่ยวข้องกับ STeP ให้ใช้ Brand source ที่ได้รับหรือ Brand reference ของระบบเป็นข้อมูลประกอบ
หลักทั่วไป:
Brand ต้องสนับสนุนงาน ไม่ใช่ครอบภาพทั้งหมด
ไม่จำเป็นต้องใช้สี STeP เป็นสีหลักในทุกภาพ
ใช้ CI ตามบริบท ความเหมาะสม และระดับความเป็นทางการ
Logo จริงต้องมาจาก Official Asset
AI ไม่ควรสร้างหรือเลียนแบบ Logo STeP / CMU ขึ้นใหม่
Co-branding หรือ Partner Brand ต้องอ้างอิง Asset หรือ Guideline ที่ได้รับ
หากไม่มี Brand source ที่ยืนยันได้ อย่าสร้าง Brand rule ใหม่จากความจำหรือความชอบ
เมื่อต้องตรวจ Brand compliance อย่างเป็นทางการ ให้ใช้ Brand Review Skill หรือ Brand Reference ที่เกี่ยวข้องแทน
---
6. Build Prompt Spec → Confirm Family → Render

สร้าง **Prompt Spec** ก่อนทุกครั้ง โดยใช้ schema ใน `references/prompt-spec.md`:

`SUBJECT / ACTION / SETTING / SHOT / PLACEMENT / TEXT_SPACE / RATIO / LIGHT / MEDIUM / STYLE / PALETTE / MUST_KEEP / CHANGE_ONLY / EXCLUDE`

หลัก:
- `SUBJECT` เป็นข้อมูลบังคับ
- `ACTION` ควรระบุเมื่อภาพมีคน/วัตถุที่ต้องดูเป็นธรรมชาติ ไม่เป็น stock
- `TEXT_SPACE` ต้องระบุเป็นพื้นที่จริงของเฟรม ไม่ใช้คำกว้าง ๆ ว่า “เว้นที่ไว้”
- `PALETTE` ใช้คำบรรยายเป็นค่าเริ่มต้น ไม่ hard-code hex หากไม่มี controlled brand source
- เติม baseline `EXCLUDE` เรื่อง text/logo/anatomy เว้นแต่ผู้ใช้ต้องการสิ่งนั้นโดยตรง
- งานแก้ภาพต้องมี `MUST_KEEP` และ `CHANGE_ONLY`

จากนั้น:
1. ระบุหรือถาม syntax family เพียงครั้งเดียว
2. render จาก Spec ตาม Family A/B/C/D
3. ถ้า Family B ให้ส่งค่า ratio handoff เป็น width/height แยกเสมอ
4. ห้ามแก้ rendered prompt เป็น source of truth; การแก้รอบถัดไปต้องสะท้อนกลับไปที่ Spec ก่อน render ใหม่

Prompt ที่ render แล้วต้อง self-contained และมีเฉพาะรายละเอียดที่ส่งผลต่อภาพจริง หลีกเลี่ยงคำคุณศัพท์ซ้ำและ generic negative ที่ไม่เกี่ยวกับงาน
---
Editing Existing Images
งานแก้ภาพใช้ **Family D — Edit / inpaint** เป็นค่าเริ่มต้นเมื่อเครื่องมือรองรับ image input

แปลงเจตนาเป็น Spec:
- `MUST_KEEP` — Structure, Subject identity, Camera angle, Massing, Proportion, Existing layout, Existing objects และ material ที่ห้ามเปลี่ยน
- `CHANGE_ONLY` — สิ่งที่ผู้ใช้ขอเปลี่ยนจริง
- `EXCLUDE` — สิ่งที่ห้ามเพิ่มหรือห้ามเกิดระหว่างการแก้
- `LIGHT` — ทิศทางแสงเดิมที่ผลใหม่ต้องเชื่อมต่อให้สมจริง

renderer ต้องบอกสิ่งที่รักษา **ก่อน** สิ่งที่จะเปลี่ยน และแก้เฉพาะ `CHANGE_ONLY`

หากผู้ใช้ไม่ได้ขอเปลี่ยน framing / ratio / color grading ให้รักษาของเดิมไว้เป็นค่าเริ่มต้น

หลีกเลี่ยงคำรับประกัน เช่น `preserve 100%` หากเครื่องมือปลายทางไม่สามารถรับประกัน fidelity ได้จริง
---
Truth & Information Integrity
ห้ามสร้างสิ่งที่อาจถูกเข้าใจว่าเป็นข้อเท็จจริงของ STeP หรือโครงการโดยไม่มีข้อมูลรองรับ เช่น:
Event ที่ไม่เคยเกิดขึ้น
Award
Statistics
Research result
Performance claim
Endorsement
Technical specification
Institutional achievement
บุคคลจริงที่ผู้ใช้ไม่ได้ให้เป็น Reference
Logo ปลอม
Conceptual imagery, architectural visualization, staged innovation scene และ generic professional people สามารถใช้ได้เมื่อเหมาะสม
หากภาพจำลองอาจถูกเข้าใจว่าเป็นเหตุการณ์หรือสถานที่จริง ให้เสนอให้ระบุใน Final Communication ว่า:
`Concept Image`
`ภาพจำลอง`
`Artist Impression`
ตามบริบท
---
Visual Direction Reference
ส่วนนี้เป็น Vocabulary สำหรับช่วยสร้าง Art Direction ไม่ใช่ Template บังคับ
Corporate / Minimal
เหมาะกับ:
Official communication
Service
Knowledge
Workflow
Information design
ลักษณะ:
clear hierarchy
modular grid
generous negative space
restrained visual system
high readability
Editorial / Swiss
เหมาะกับ:
Report
Campaign
Contemporary communication
Presentation visual
ลักษณะ:
asymmetric grid
strong scale contrast
controlled negative space
refined typographic hierarchy
Illustration
เหมาะกับ:
Guide
Service communication
Internal communication
Conceptual explanation
ลักษณะ:
clear simplified forms
approachable but professional
readable composition
avoid childish styling unless requested
Information / Isometric
เหมาะกับ:
Process
Ecosystem
Campus / Service map
Journey visualization
ลักษณะ:
coherent axonometric logic
consistent scale
clear navigation
no random decorative elements
Photorealistic
เหมาะกับ:
Campaign
Event
People
Product
Lifestyle
ลักษณะ:
believable lighting
natural material response
authentic behavior
realistic environment
avoid stock-photo feeling unless requested
Architectural / Exhibition
เหมาะกับ:
Booth
Exhibition
Interior
Spatial concept
ลักษณะ:
believable scale
realistic materials
structural logic
circulation clarity
signage safe zones
Technology / Product
เหมาะกับ:
Deep Tech
MedTech
AgriTech
Robotics
AI hardware
Prototype showcase
ลักษณะ:
product as hero
credible material
controlled commercial lighting
precise detail
avoid unsupported technical claims
Human-Centered Documentary
เหมาะกับ:
Community
Entrepreneur
Impact
Local context
ลักษณะ:
authentic human interaction
natural environment
observational composition
sincere non-stock atmosphere
Cultural / Experimental
เหมาะกับ:
Creative Lanna
Cultural innovation
Exhibition
Experimental campaign
ลักษณะ:
mixed media
tactile material cues
collage / naive marks when appropriate
authentic cultural reference
avoid decorative tokenism
Reference-led
ใช้เมื่อมีภาพอ้างอิง
ให้ดึง transferable design principles จาก Reference แล้วปรับให้เข้ากับเนื้อหา Brand และข้อจำกัดของงานใหม่
---
Output
Default output ต้องมี **2 ส่วน** เพื่อให้แก้รอบถัดไปจาก source เดียว:

1. **Prompt Spec** — ค่า field ที่ใช้จริง
2. **Rendered Prompt** — prompt ที่ render ตาม Family A/B/C/D

ระบุ family ที่ใช้สั้น ๆ เช่น:
`Renderer: A · Ratio: 16:9`

Family B ต้องเพิ่ม:
- **Positive**
- **Negative**
- **Ratio handoff / width × height** หรือระบุว่าต้องตั้ง width/height ใน UI หากยังไม่รู้ข้อจำกัดเครื่องมือ

Family D ต้องแสดง `MUST_KEEP` และ `CHANGE_ONLY` ใน Spec ชัดเจนก่อน rendered edit instruction

หากผู้ใช้ต้องการแก้ ให้แก้ค่าใน **Prompt Spec** ก่อน แล้ว render ใหม่ ห้าม patch rendered prompt โดยตรงเป็น source of truth

ไม่ต้องแสดง chain-of-thought, checklist ภายใน หรือ reasoning ยาว

Advanced Output แสดงเมื่อผู้ใช้ขอ:
Art Direction
Keep / Adapt / Avoid
Brand considerations
Visual rationale
Alternative directions
Prompt variants
---
Missing Information
ถามเพิ่มเฉพาะเมื่อข้อมูลที่ขาดมีผลต่อภาพจริง
หัวข้อที่อาจจำเป็น เช่น:
WHAT — ต้องการสร้างอะไร
PURPOSE — ใช้เพื่ออะไร
AUDIENCE — ผู้ชมคือใคร
FORMAT — ขนาด / Aspect ratio / Channel
MUST HAVE — สิ่งที่ต้องมี
PRESERVE — สิ่งที่ห้ามเปลี่ยน
REFERENCE — ภาพอ้างอิง
ถามเพียงเท่าที่จำเป็น
หากสามารถดำเนินการได้อย่างสมเหตุสมผลจากข้อมูลที่มี ให้สร้าง Prompt ต่อได้เลย
---
Rules
ห้ามสร้าง Logo STeP / CMU ขึ้นเอง
ห้ามสร้าง Fact, Metric, Award, Claim หรือ Endorsement ที่ไม่มีหลักฐาน
ห้ามเปลี่ยน Reference ให้เป็น Requirement โดยอัตโนมัติ
ห้ามเปลี่ยนสิ่งที่ผู้ใช้สั่งให้รักษาโดยไม่มีเหตุผล
ห้ามยัด CI ลงทุกภาพ
ห้ามสร้างรายละเอียดทางเทคนิคที่ไม่มีข้อมูลรองรับ
ห้ามใช้ Negative Prompt ยาวแบบ generic หากไม่เกี่ยวข้อง
ห้ามถามข้อมูลที่มีอยู่แล้ว
หากข้อมูลพอ ให้สร้าง Prompt ทันที
หากข้อมูลไม่พอ ให้ถามเฉพาะสิ่งที่มีผลต่อผลลัพธ์
Prompt ต้องเน้นสิ่งที่มีผลต่อภาพจริง
Prompt ที่ส่งเป็นค่าเริ่มต้นต้อง self-contained และ copy-ready
Prompt Spec เป็น source of truth สำหรับ revision และ tool-switch
ห้าม hard-code ชื่อรุ่นโมเดลเป็น Capability Gate ของ Skill
หากไม่ทราบ syntax family ให้ใช้ Family A ชั่วคราวและเปิดเผย assumption
Family B ต้องส่ง ratio handoff แยกจาก prompt
งาน edit/inpaint ต้องรักษา MUST_KEEP ก่อนระบุ CHANGE_ONLY
---
Internal Self-Check
ก่อนส่ง Prompt ให้ตรวจภายในโดยไม่จำเป็นต้องแสดงแก่ผู้ใช้:
Intent — ภาพตอบวัตถุประสงค์หรือไม่
Audience — Visual Direction เหมาะกับผู้ชมหรือไม่
Hierarchy — จุดนำสายตาชัดหรือไม่
Preserve — สิ่งสำคัญที่ต้องรักษาถูกระบุครบหรือไม่
Brand — ใช้ Brand context อย่างเหมาะสมหรือไม่
Truth — ไม่มี fabricated fact / fake logo / misleading claim หรือไม่
Production — Format, text zone หรือ safe area ถูกระบุเมื่อจำเป็นหรือไม่
Spec — Prompt Spec ครบ field ที่มีผลต่อภาพและเป็น source of truth หรือไม่
Renderer — syntax family ตรงกับเครื่องมือหรือเป็น assumption ที่เปิดเผยแล้วหรือไม่
Copy-ready — Rendered Prompt ใช้งานได้ด้วยตัวเองหรือไม่
Clutter — มีรายละเอียดที่ไม่ช่วยผลลัพธ์มากเกินไปหรือไม่
หากพบความไม่แน่นอนที่สำคัญ ให้คงความไม่แน่นอนไว้หรือถามเฉพาะจุดนั้นแทนการเดา
