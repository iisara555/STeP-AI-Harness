---
name: step-image-prompt
description: เปลี่ยนวัตถุประสงค์ เนื้อหา บริบท และภาพอ้างอิงของงาน STeP ให้เป็น Art Direction และ Prompt สำหรับสร้างหรือแก้ภาพ AI ที่พร้อมใช้งาน โดยรักษาข้อเท็จจริง โครงสร้างสำคัญ และ Brand context ที่ได้รับ พร้อมไม่สร้าง Logo, Claim หรือข้อมูลที่ไม่มีหลักฐาน
---
# STeP Image Prompt

## Capability Gate

งานที่ต้องใช้ context และ reference image ต้องใช้ image model ที่รองรับ image input และ contextual understanding อย่างน้อยระดับ **GPT-Image-2-class หรือเทียบเท่า**; แนะนำ **GPT-Image-2.5-class** หรือสูงกว่าเมื่อมีให้ใช้

ห้ามใช้ Reference-Led mode เสมือนว่าโมเดลเห็นภาพ หากเครื่องมือปลายทางไม่รองรับการรับภาพ ให้แจ้งข้อจำกัดและเปลี่ยนเป็น Text-Only Prompt
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
6. Build Prompt
ประกอบ Prompt ให้เป็นข้อความเดียวที่ self-contained และพร้อมใช้
Prompt ควรรวมเฉพาะองค์ประกอบที่มีผลต่อภาพจริง เช่น:
Subject และสิ่งที่ต้องการสร้าง
Purpose / Context
Audience เมื่อมีผลต่อ Visual Direction
Art Direction / Mood
Composition และ Visual hierarchy
Material / Illustration / Photography language
Lighting / Perspective เมื่อเกี่ยวข้อง
Color relationship
Brand context เมื่อเกี่ยวข้อง
Typography / Text zone / Logo safe area เมื่อจำเป็น
Format / Aspect ratio
สิ่งที่ต้องรักษา
สิ่งที่ต้องหลีกเลี่ยง
หลีกเลี่ยง Prompt ที่ยาวจากคำคุณศัพท์ซ้ำ ๆ หรือ Negative Prompt แบบ generic ที่ไม่ช่วยควบคุมผลลัพธ์
---
Editing Existing Images
กรณีผู้ใช้ต้องการแก้ภาพเดิม ให้ Prompt แยกเจตนาให้ชัดเจนเป็น:
Preserve
สิ่งที่ต้องคงเดิม เช่น:
Structure
Subject identity
Camera angle
Massing
Proportion
Existing layout
Existing objects
Material ที่ผู้ใช้ไม่ต้องการเปลี่ยน
Change
สิ่งที่ต้องแก้จริง
Avoid
สิ่งที่ไม่ควรเกิดขึ้นระหว่างการแก้
หลักสำคัญ:
แก้เฉพาะสิ่งที่ผู้ใช้ขอเปลี่ยน และรักษาส่วนอื่นไว้ให้มากที่สุด
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
Default
เมื่อข้อมูลเพียงพอ ให้เริ่มจากผลลัพธ์ที่ผู้ใช้สามารถนำไปใช้ได้ทันที
Prompt พร้อม Copy
ใช้ Prompt ฉบับเดียวที่ self-contained
ไม่ต้องแสดงขั้นตอนคิดหรือ checklist ภายใน
หลัง Prompt สามารถสรุป metadata สั้น ๆ ได้เมื่อมีประโยชน์ เช่น:
`Direction: Architectural / Exhibition · Format: 16:9`
Prompt-only Request
หากผู้ใช้ขอ:
"เอาแต่ Prompt"
"ขอ Prompt อย่างเดียว"
"copy อย่างเดียว"
ให้ส่งเฉพาะ Prompt โดยไม่เพิ่มคำอธิบายอื่น
Advanced Output
แสดงข้อมูลเหล่านี้เฉพาะเมื่อผู้ใช้ขอ:
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
Copy-ready — Prompt ใช้งานได้ด้วยตัวเองหรือไม่
Clutter — มีรายละเอียดที่ไม่ช่วยผลลัพธ์มากเกินไปหรือไม่
หากพบความไม่แน่นอนที่สำคัญ ให้คงความไม่แน่นอนไว้หรือถามเฉพาะจุดนั้นแทนการเดา
