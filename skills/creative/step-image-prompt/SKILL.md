---
name: step-image-prompt
description: สร้างและแนะนำ Prompt สำหรับสร้างภาพ AI สไตล์ 2D Vector, Infographic และ Notion Minimalist Line Art ตามอัตลักษณ์สีเหลือง STeP และค่านิยม Simple Service Sincere
---

# STeP Image Prompt Generator (ทักษะสร้าง Prompt สื่อภาพ AI)

ทักษะนี้ใช้สำหรับช่วยพนักงานทุกแผนกของ **อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP / RSP North)** สร้าง Prompt สำหรับนำไปใช้งานกับเครื่องมือ Generative AI (เช่น ChatGPT / DALL-E 3, Midjourney, Google Gemini) เพื่อสร้างภาพสื่อประชาสัมพันธ์ โปสเตอร์กิจกรรม และอินโฟกราฟิก โดยมีจุดประสงค์หลักเพื่อ **ควบคุมอัตลักษณ์ของแบรนด์ (Brand CI) ไม่ให้เสียหาย**

---

## 🎨 กฎเหล็กด้านอัตลักษณ์องค์กร (STeP Brand CI & Core Values)

ทุก Prompt ที่สร้างขึ้นจากทักษะนี้ ต้องถูกล็อกด้วยค่ากำหนดมาตรฐานต่อไปนี้เสมอ:

1. **สไตล์ภาพ (Art Direction):**
   - **ห้ามใช้ภาพถ่ายคนจริง (No Photorealism)** และ **ห้ามภาพเรนเดอร์ 3D เงาวับแบบพลาสติก (No Glossy CGI)**
   - ใช้สไตล์ **2D Flat-Vector Illustration**, **Isometric Infographic**, **Editorial Line Art**, หรือ **Notion-Style Minimalist Line Art** ที่สะอาดตา มีระดับ
2. **ค่านิยมหลักขององค์กร (Core Values):**
   - **SIMPLE (เรียบง่าย):** การจัดวางแบบ Swiss/Nordic Minimalism โปร่งโล่ง มีพื้นที่ว่าง (Negative Space $\ge 30\%$) เข้าถึงง่าย
   - **SERVICE (ใส่ใจบริการ):** ตัวละครการ์ตูนแสดงออกถึงความเป็นมิตร อบอุ่น มีรอยยิ้มจริงใจ บรรยากาศการทำงานร่วมกัน (Co-Creation)
   - **SINCERE (จริงใจ โปร่งใส):** ลายเส้นที่ซื่อสัตย์ ชัดเจน ตรงไปตรงมา ไม่หลอกตา สะท้อนความเป็นมิตรของชาวเหนือ
3. **ชุดสีที่ได้รับอนุมัติ (Approved Color Palette):**
   - **STeP Innovation Yellow:** `#F9AE3B` / `#F2A32D` (สีเหลืองอำพันนวัตกรรม สดใส มีพลัง อบอุ่น เป็นสีหลัก)
   - **Corporate Slate Charcoal:** `#2B333D` (สีตัวหนังสือ กรอบโครงสร้าง และสูท สุขุม ทันสมัย น่าเชื่อถือ)
   - **Crisp Pure White:** `#FFFFFF` และ **Off-White:** `#FAF9F6` (สำหรับพื้นหลังและพื้นที่หายใจ)
   - **Blonde Wood Accent:** โทนสีไม้ธรรมชาติสว่าง สะท้อนเอกลักษณ์อาคาร STeP
4. **พื้นที่ปลอดภัยสำหรับวางโลโก้จริง (Logo Safe Zone):**
   - เว้นพื้นที่ว่างบริเวณมุมซ้ายบนหรือมุมขวาบนประมาณ 15% เสมอ เพื่อให้พนักงานนำไฟล์โลโก้จริง (`.png`) ไปวางทับใน Canva/Photoshop ได้สะดวก

---

## 🧙‍♂️ ขั้นตอนการทำงานแบบ Guided Wizard (สำหรับ AI เมื่อพนักงานเรียกใช้)

เมื่อพนักงานแจ้งความประสงค์ เช่น *"อยากทำโปสเตอร์..."*, *"ขอ prompt สร้างภาพ..."*, หรือ *"ช่วยคิด prompt ทำ infographic..."*  
**ห้ามสร้าง Prompt ทันทีหากยังไม่ได้ข้อมูลครบถ้วน** ให้ทำหน้าที่เป็นพี่เลี้ยงและถามคำถามนำทางทีละขั้นตอน (Step-by-Step):

### ขั้นที่ 1: สอบถามข้อมูลเบื้องต้น 4 ข้อสั้นๆ
ถามพนักงานด้วยภาษาไทยที่เป็นมิตรและเข้าใจง่าย:
1. **ชื่องานหรือหัวข้อหลัก:** (เช่น ชื่องานสัมมนา, โครงการบ่มเพาะ, ประกาศรับสมัคร)
2. **สไตล์ภาพที่ต้องการ:** แนะนำ 4 สไตล์ให้เลือก:
   - `[1] โปสเตอร์กิจกรรม 2D Vector ไดนามิก:` (สไตล์งานวิ่ง / แข่งขัน / Sprint แถบเฉียง ริบบิ้นไทโปกราฟี)
   - `[2] แผนที่บริการ 3D Isometric Map:` (แผนที่ผังอุทยานฯ ตัวการ์ตูน Q-version จิ๋ว ป้ายชื่อหน่วยงาน)
   - `[3] อินโฟกราฟิก 2D Flat Vector Infographic:` (อินโฟกราฟิก 3 ชั้น พาดหัวบน + ภาพวาดกลาง + กล่องกำหนดการล่าง)
   - `[4] ภาพประกอบลายเส้นสไตล์ Notion (Notion-Style Minimalist Line Art):` (ภาพการ์ตูนลายเส้นขาว-ดำแบบ Notion แต้มสีเหลืองจุดเด่น STeP Yellow เรียบง่าย สะอาดตา เหมาะกับคู่มือ บทความ สไลด์นำเสนอ)
3. **ภาพหรือกิจกรรมหลักที่อยากให้เห็นตรงกลาง:** (เช่น เจ้าหน้าที่ STeP ให้คำปรึกษาสตาร์ทอัพ, นักวิจัยทดสอบโดรน, คนถือแล็ปท็อป)
4. **ภาษาข้อความบนภาพ:** ต้องการให้ตัวหนังสือบนภาพเป็นภาษาอังกฤษ (แนะนำ) หรือภาษาไทย

### ขั้นที่ 2: ประกอบร่างเป็น Master Prompt ตามสไตล์ที่เลือก
นำข้อมูลที่ได้ไปเติมลงในตัวแปร `[USER_INPUT]` ของเทมเพลตที่เลือก โดยคงส่วน `PROMPT GENERATION FRAMEWORK` และ `AUTOMATIC FIXED PARAMETERS` ไว้อย่างเคร่งครัด

### ขั้นที่ 3: ส่งมอบ Prompt พร้อมคำแนะนำการใช้งาน
ส่งโค้ด Prompt ให้พนักงาน พร้อมแนะนำ 3 สเต็ปง่ายๆ:
1. คัดลอก Prompt ไปวางในเครื่องมือ AI (Midjourney / ChatGPT / Gemini)
2. เมื่อได้ภาพมาแล้ว ให้นำไปเปิดใน Canva
3. นำไฟล์โลโก้ STeP จริงมาวางที่มุมบน และพิมพ์ข้อความรายละเอียดภาษาไทยเพิ่มเติม

---

## 📐 คลัง Master Prompt Framework ทั้ง 4 สไตล์

### สไตล์ที่ 1: Dynamic 2D Vector Innovation Sprint & Event Poster
```markdown
[USER_INPUT]
• EVENT_THEME: [ระบุหัวข้อโครงการ]
• DYNAMIC_RUNNER_AND_PROPS_ARTWORK: [ระบุกิจกรรมตัวละครและอุปกรณ์]
• MAIN_TITLE_AND_RIBBON_TEXT: [ข้อความพาดหัวหลัก]
• VENUE_DATES_AND_LOCATION: [วัน เวลา และสถานที่จัดงาน]
• DEPARTMENT_AND_FACULTY_INFO: อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP / RSP North)
• SPLIT_BACKGROUND_PALETTE: Top clean white sky (#FFFFFF) vs. Bottom dynamic athletic track in STeP Innovation Yellow (#F9AE3B) with crisp white lane lines
• LANGUAGE: [Thai หรือ English]
---
PROMPT GENERATION FRAMEWORK
TASK
Create a clean, production-quality innovation sprint and exhibition event poster prompt based entirely on USER_INPUT while strictly enforcing the dynamic high-angle 2D vector visual parameters and STeP CMU Brand CI below.

AUTOMATIC FIXED PARAMETERS (DO NOT ALTER)
• THEME: Innovation Sprint & Startup Exhibition Poster / Dynamic Academic Pitching & Growth Concept
• VIEW: High-angle dynamic diagonal bird's-eye view with zero camera perspective distortion
• STYLE: Clean 2D digital vector illustration featuring energetic character figures, 3D folded ribbon-style typography, high-contrast diagonal split backdrop, smooth flat drop shadows, and vibrant flat color fills embodying STeP core values: SIMPLE, SERVICE, SINCERE
• FORMAT: Vertical A3/A4 event poster layout
• LIGHTING: Bright, uniform vector illustration daylight highlighting character runners, finish line ribbons, and paper ribbon lettering
• BACKDROP: Dynamic diagonal split composition governed by STeP CI: Crisp Pure White (#FFFFFF) on upper half vs. vibrant STeP Innovation Yellow (#F9AE3B) and Slate Charcoal (#2B333D) lane lines on lower plane
• COLOR PALETTE: Strict STeP Corporate Identity: Dominant STeP Golden Yellow (#F9AE3B), Slate Charcoal (#2B333D), Crisp White (#FFFFFF), and soft cream (#FAF9F6)

POSTER COMPOSITION LOGIC
- Top Plane: Position MAIN_TITLE_AND_RIBBON_TEXT prominently in custom 3D folded ribbon typography, accompanied by VENUE_DATES_AND_LOCATION inside clean badge containers and official STeP CMU logo lockup along the top margins.
- Lower Plane: Render DYNAMIC_RUNNER_AND_PROPS_ARTWORK vividly across the diagonal ground plane, showing friendly characters sprinting towards a finish line tape while proudly holding prototype devices and laptops.
- Lower Margins: Place DEPARTMENT_AND_FACULTY_INFO neatly across the bottom section using highly legible sans-serif typography.

LANGUAGE LOCK
All text elements MUST be written exclusively in LANGUAGE as specified in USER_INPUT.
If LANGUAGE = Thai, render all titles and department names in dynamic, modern Thai typography.
If LANGUAGE = English, maintain clean international Latin typography.

RESTRICTIONS
- ABSOLUTELY NO REALISTIC 3D PHOTOGRAMMETRY, PHOTOGRAPHIC NOISE, REAL-WORLD TABLETOP SCENE CLUTTER, OR HYPER-REALISTIC FACES.
- NO unapproved neon colors, purple gradients, or dingy dark backgrounds.
- Preserve 100% full-frame vector sharpness, dynamic movement clarity, and readable event typography.
```

---

### สไตล์ที่ 2: Isometric Science Park & Innovation Ecosystem Map
```markdown
[USER_INPUT]
• URBAN_SUBJECT: [สถานที่หรืออาคารหลัก เช่น: STeP Chiang Mai University Science Park Campus, featuring modern blonde-timber buildings, glass bridges, and central amphitheater courtyard]
• ISOMETRIC_SIGNBOARD_MATRIX: [ป้ายชื่ออาคารและบริการ 4-6 ป้าย เช่น: STeP CMU / PROTOTYPING LAB / STARTUP INCUBATOR / THE BRICK / MAKE INNOVATION SIMPLE]
• TYPOGRAPHY_AND_TEXT_PARODIES: [ข้อความบนป้ายหรือจุดเด่น]
• CHARACTER_ACTIVITIES_DESCRIPTION: [กิจกรรมตัวละครจิ๋ว Q-version แสดงความเป็นมิตรและการทำงานร่วมกัน]
• COLOR_PALETTE_AND_STYLE: STeP Innovation Yellow (#F9AE3B), Slate Charcoal (#2B333D), Warm Blonde Wood (#D4A373), Fresh Leaf Green, and Crisp White (#FFFFFF)
• BACKGROUND_CANVAS: Seamless warm off-white canvas (#FAF9F6)
• LANGUAGE: [Thai หรือ English]
---
PROMPT GENERATION FRAMEWORK
TASK
Create a clean, production-quality 3D isometric science park map & innovation ecosystem infographic prompt based entirely on USER_INPUT while strictly enforcing the clean 3D isometric orthographic presentation and STeP CMU Brand CI below.

AUTOMATIC FIXED PARAMETERS (DO NOT ALTER)
• THEME: Isometric Science Park Campus & Innovation Ecosystem / Digital Vector Infographic Illustration
• VIEW: High-angle clean 3D isometric orthographic projection with zero perspective distortion
• STYLE: Clean vector infographic featuring 3D isometric architectural buildings with modern blonde wood and glass, Q-version tiny character figures embodying STeP core values (SIMPLE, SERVICE, SINCERE), sharp clean line art, solid color fills, high clarity, and zero perspective blurring
• FORMAT: Vertical or square infographic map layout
• LIGHTING: Flat, crisp infographic illustration daylight with vibrant contrast as defined in COLOR_PALETTE_AND_STYLE
• BACKDROP: Seamless warm off-white canvas (#FAF9F6) cleanly isolating all architectural and landscape assets directly

ISOMETRIC MAP & CHARACTER LOGIC
- Base Layout: Construct a dense, organized 3D isometric campus map of URBAN_SUBJECT, featuring Scandinavian-inspired blonde timber louvers, glass atriums, green gardens, and courtyard amphitheater stairs.
- Signboard Matrix: Scatter readable institutional and facility signboards specified in ISOMETRIC_SIGNBOARD_MATRIX in signature STeP Innovation Yellow (#F9AE3B) and Slate Charcoal (#2B333D) across building rooftops and entrances.
- Typography: Apply TYPOGRAPHY_AND_TEXT_PARODIES cleanly onto each 3D signboard with maximum legibility.
- Tiny Characters: Populate the campus with charming Q-version tiny illustrated innovators, researchers, and friendly STeP service officers engaging in CHARACTER_ACTIVITIES_DESCRIPTION, with speech bubbles for interactive warmth.

LANGUAGE LOCK
All text elements MUST be written exclusively in LANGUAGE as specified in USER_INPUT.

RESTRICTIONS
- ABSOLUTELY NO 3D Perspective Blurring, DOF distortion, or realistic photographic camera rendering.
- NO unaligned floating models outside the isometric grid logic.
- NO dark dingy backgrounds or muddy colors; preserve the warm, optimistic yellow-and-white atmosphere.
- Preserve full-frame visual clarity, sharp vector lines, high typographic legibility, and organized map alignment.
```

---

### สไตล์ที่ 3: 2D Flat Vector Editorial Infographic Poster
```markdown
[USER_INPUT]
• LANGUAGE_OUTPUT: [Thai หรือ English]
• EVENT_THEME: [ระบุหัวข้อโครงการ]
• HEADLINE_LINE_1: [พาดหัวบรรทัดที่ 1]
• HEADLINE_LINE_2: [พาดหัวบรรทัดที่ 2]
• SUB_HEADLINE_TEXT: [ข้อความขยายความ]
• CENTRAL_INNOVATION_VIGNETTE: [อธิบายภาพวาดตรงกลาง เช่น: a friendly, approachable 2D illustrated Thai female innovation officer with a warm sincere smile in a minimal charcoal blazer, happily guiding a young university entrepreneur over a tech prototype on a clean white desk]
• KEYWORD_BUBBLES: [คำในฟองคำพูด 3-4 คำ]
• SCHEDULE_TIMETABLE: [กำหนดการ 3 ช่วงเวลา]
• ACCENT_PALETTE: STeP Innovation Yellow (#F9AE3B), Slate Charcoal (#2B333D), Crisp White (#FFFFFF), and Warm Cream (#F8FAFC)
• BADGE_METADATA: STeP CMU · Make Innovation Simple
---
PROMPT GENERATION FRAMEWORK
TASK
Create an authentic 2D flat-vector innovation event poster combining clean orthographic illustration, structured information hierarchy, accessible editorial line art, and STeP's core values: SIMPLE, SERVICE, SINCERE.

[VISUAL HIERARCHY & COMPOSITION]
• Upper Tier (25%): Prominent stacked display headlines (HEADLINE_LINE_1 & HEADLINE_LINE_2) in bold, friendly, high-contrast typography in Slate Charcoal (#2B333D) set against a vibrant STeP Yellow (#F9AE3B) header background, accompanied by SUB_HEADLINE_TEXT in clean sans-serif. Balanced BADGE_METADATA across the upper right margin.
• Middle Tier (55%): CENTRAL_INNOVATION_VIGNETTE as the dominant illustrated focal point on a clean off-white field, supported by floating KEYWORD_BUBBLES in STeP Yellow and theme-relevant graphic stepped motifs.
• Lower Tier (20%): SCHEDULE_TIMETABLE arranged as three clear chronological blocks, badges, or structured modules with clean rounded borders across the footer.

[STYLE & ILLUSTRATION ANATOMY]
• Illustration Style: 2D flat vector line art, clean Scandinavian/Swiss editorial cartooning, precise monoline outlines, crisp graphic shapes, and zero clutter.
• Camera & Perspective: Strictly flat 2D orthographic front view. Zero 3D perspective, zero isometric tilt, zero cinematic depth-of-field blur.
• Characters: Friendly, simplified, approachable illustrated figures with warm, sincere smiles embodying the 'SERVICE' and 'SINCERE' core values. Never hyper-realistic, never uncanny.
• Color System: Governed strictly by ACCENT_PALETTE (Yellow #F9AE3B, Slate #2B333D, White #FFFFFF).

[NEGATIVE PROMPT]
Realistic photography, photorealistic faces, real human skin, 3D render, CGI sheen, glossy textures, isometric 3D grid, cinematic lighting, drop shadows, lens flare, dark gloomy ambiance, neon disco colors, messy unreadable scribbles, blurred text, fantasy magic effects, grunge texture, distorted anatomy.
```

---

### สไตล์ที่ 4: Notion-Style Minimalist Line Art & Knowledge Illustration
```markdown
[USER_INPUT]
• SCENE_OR_CONCEPT: [ระบุหัวข้อแนวคิด เช่น: Collaborative Startup Incubation & Tech Transfer Consultation]
• MAIN_CHARACTER_ACTION: [อธิบายการกระทำของตัวละคร เช่น: a friendly female STeP business development officer in a smart casual outfit giving warm guidance and smiling sincerely, sitting next to a young male student startup founder pointing at a digital laptop wireframe]
• WORKSPACE_OBJECTS_AND_PROPS: [อุปกรณ์บนโต๊ะทำงาน เช่น: a clean minimal wooden desk with a laptop, paper blueprints, coffee mug, sticky notes, and a potted succulent plant]
• FLOATING_METAPHOR_ICONS: [ไอคอนแนวคิดที่ลอยอยู่ เช่น: an outlined glowing innovation lightbulb in vibrant yellow, floating analytics bar charts, and a stepped geometric cube icon]
• HEADER_TITLE_TEXT: [ข้อความพาดหัวด้านบน เช่น: MAKE INNOVATION SIMPLE]
• SPOT_COLOR_ACCENT: STeP Innovation Yellow (#F9AE3B) selectively highlighting key ideas, lightbulbs, and geometric step motifs
• LANGUAGE: [English หรือ Thai]
---
PROMPT GENERATION FRAMEWORK
TASK
Create a clean, production-ready Notion-style minimalist black-and-white ink illustration prompt based entirely on USER_INPUT while strictly enforcing the Roman Muradov / Notion aesthetic and STeP CMU Brand CI below.

AUTOMATIC FIXED PARAMETERS (DO NOT ALTER)
• THEME: Minimalist Conceptual Knowledge Illustration / Modern Collaborative Work & Innovation
• STYLE: Notion-inspired black and white ink line art with selective single-color accent. Clean, charming hand-drawn monoline contours, whimsical yet sophisticated character anatomy, flat graphic shapes, and high contrast against an expansive pure white canvas
• ART DIRECTION INSPIRATION: Roman Muradov editorial illustration style for Notion documentation, Swiss minimalism, embodying STeP core values: SIMPLE, SERVICE, SINCERE
• VIEW & COMPOSITION: Front-facing 2D orthographic eye-level composition with ample negative space (≥40% pure white space around the subject)
• COLOR PALETTE: Strictly restricted two-tone palette:
  - Line Art & Outlines: Crisp solid black ink (#191919) and Slate Charcoal (#2B333D)
  - Background: Pure solid white (#FFFFFF) with zero textures, zero gradients, zero shadows
  - Spot Accent: Strict STeP Innovation Yellow (#F9AE3B) applied sparingly and selectively ONLY to floating ideas, glowing lightbulbs, badges, or stepped cube elements
• CHARACTERS: Warm, friendly, approachable human figures with expressive yet minimalist facial features (dot eyes, warm sincere smile, loose casual hair). Expressing empathy, active listening, and collaboration (SERVICE & SINCERE)
• GRAPHIC ACCENTS: Floating conceptual outline doodles, stepped geometric stair blocks (STeP identity), sparkling idea stars, and clean dialogue or note boxes

TYPOGRAPHY & HEADER LOGIC
- Top Placement: If HEADER_TITLE_TEXT is provided, place it neatly across the upper center in clean, modern, sans-serif or hand-lettered editorial typography in Slate Charcoal (#2B333D).

LANGUAGE LOCK
All text elements MUST strictly follow LANGUAGE as specified in USER_INPUT.

NEGATIVE PROMPT / RESTRICTIONS
- ABSOLUTELY NO 3D rendering, NO photorealism, NO realistic human faces or skin textures, NO CGI sheen.
- NO gradients, NO complex drop shadows, NO dark backgrounds, NO multicolored rainbow fills.
- NO cluttered busy layouts; preserve high white space and iconic simplicity.
```

---

## 🛡️ ขอบเขตอำนาจหน้าที่และการควบคุม (Governance & Boundaries)

- **ALLOW (ดำเนินการได้ทันที):** ให้คำแนะนำ ออกแบบข้อความ และสร้าง Prompt ตามสไตล์ทั้ง 4 ที่ล็อก CI ของ STeP
- **HUMAN_ONLY (ต้องให้มนุษย์ตรวจอนุมัติ):** การนำภาพที่สร้างเสร็จแล้วไปเผยแพร่สู่สาธารณะภายนอก ต้องผ่านการตรวจความถูกต้องของเนื้อหา และตรวจสอบการวางตราสัญลักษณ์ร่วมตามระเบียบของทีม CC

