# Visual Direction Vocabulary

ใช้ไฟล์นี้เมื่อ Prompt Spec ต้องการเลือกหรือขยาย Art Direction เท่านั้น ไม่ต้องโหลดเป็น first-pass context ทุกครั้ง

| Direction | เหมาะกับ | ลักษณะสำคัญ |
| --- | --- | --- |
| Corporate / Minimal | Official communication, service, knowledge, workflow | clear hierarchy, modular grid, generous negative space, restrained system |
| Editorial / Swiss | Report, campaign, presentation visual | asymmetric grid, strong scale contrast, controlled negative space |
| Illustration | Guide, service communication, conceptual explanation | simplified forms, approachable but professional |
| Information / Isometric | Process, ecosystem, campus/service map | coherent axonometric logic, consistent scale, clear navigation |
| Photorealistic | Campaign, people, product, lifestyle | believable lighting, natural material response, authentic behavior |
| Architectural / Exhibition | Booth, exhibition, interior, spatial concept | believable scale, structural logic, circulation clarity, signage safe zones |
| Technology / Product | Deep Tech, MedTech, AgriTech, robotics, prototype | product as hero, precise detail, controlled lighting, no unsupported technical claims |
| Human-Centered Documentary | Community, entrepreneur, impact | observational composition, authentic interaction, non-stock atmosphere |
| Cultural / Experimental | Creative Lanna, cultural innovation, exhibition | mixed media, tactile cues, authentic reference, avoid decorative tokenism |
| Reference-Led | มีภาพอ้างอิง | แยก Keep / Adapt / Avoid แล้วนำ transferable design principles ไปใช้กับบริบทใหม่ |

## Selection rule

เลือก direction จากวัตถุประสงค์ ผู้ชม และ medium ก่อนความชอบส่วนตัว

ไม่จำเป็นต้องบอกชื่อ direction ให้ผู้ใช้ทุกครั้ง หาก Prompt Spec และ rendered prompt ชัดเจนอยู่แล้ว

## Reference-Led rule

Reference ไม่ใช่ Requirement ทั้งหมดโดยอัตโนมัติ

วิเคราะห์:
- composition
- hierarchy
- color relationship
- material
- lighting
- perspective
- graphic rhythm
- typography character
- emotional tone

แยกเป็น:
- **Keep** — สิ่งที่ผู้ใช้สั่งให้รักษาหรือเป็นแก่นที่จำเป็น
- **Adapt** — หลักการที่นำไปตีความใหม่ได้
- **Avoid** — สิ่งที่ไม่เหมาะกับบริบทใหม่หรือไม่ควรลอก

ถ้าเป็นภาพเดิมที่ต้องแก้ ให้ใช้ Family D และย้ายสิ่งที่ต้องรักษาไปที่ `MUST_KEEP`.
