# STeP AI

**STeP Desktop** คือหน้าจอทำงานหลักของ STeP AI Harness สำหรับพนักงาน STeP / RSP North ใช้สำหรับคุยกับ AI, แนบเอกสาร, ใช้ Skill/Playbook, ตรวจร่าง, ส่งออกไฟล์ และใช้เครื่องมือเฉพาะ เช่น **ตรวจใบเสร็จก่อนส่ง AFP** โดยไม่ต้องใช้ Git, Terminal หรือจำชื่อ Skill

> สำหรับผู้ใช้ทั่วไป: เริ่มจาก **STeP Desktop GUI**  
> สำหรับผู้ดูแล/นักพัฒนา: รายละเอียด Harness, Router และ manifests อยู่ช่วงท้ายของ README นี้

## เลือกวิธีใช้ STeP AI

มี 2 วิธีเท่านั้น ใช้ Skills และกติกาชุดเดียวกัน

| วิธี | เหมาะกับ | อ่านต่อ |
| --- | --- | --- |
| **STeP Desktop** (แนะนำ) | พนักงานทุกคน ไม่ต้องใช้ terminal มีหน้าตรวจใบเสร็จ AFP แถบผลงาน และส่งออกไฟล์ | หัวข้อ 1–12 |
| **STeP Skills ในโปรแกรม AI ที่มีอยู่แล้ว** | คนที่ใช้ **Claude**, **Codex** หรือ **Google Antigravity** อยู่แล้วและอยากได้ Skills ของ STeP ในโปรแกรมนั้น | [หัวข้อ 13](#13-ใช้-step-skills-ใน-claude-codex-หรือ-antigravity) |

ช่องทางที่**เลิกใช้แล้ว**: ชุด ZIP + `Install-STeP-AI.bat` / `.command` แบบเปิดโฟลเดอร์ด้วยโปรแกรม AI และ Gemini CLI (Google หยุดให้บริการกับบัญชีส่วนตัวตั้งแต่ 18 มิ.ย. 2569) ใครยังใช้อยู่ให้ย้ายมาใช้ STeP Desktop หรือหัวข้อ 13

**เอกสารที่เกี่ยวข้อง:** [คู่มือพนักงาน](docs/employee-guide.md) · [คู่มือ Desktop สำหรับนักพัฒนา](desktop/README.md) · [STeP AI Support](SUPPORT.md)

---

## เริ่มใช้งานแบบสั้นที่สุด

1. รับตัวติดตั้ง **STeP Desktop** จาก Shared Drive หรือช่องทางภายในที่องค์กรอนุมัติ
2. ติดตั้งและเปิดแอป
3. ทำ Setup Wizard ครั้งแรก
4. เชื่อมบัญชี AI ที่คุณมีอยู่แล้ว
5. กด **เริ่มงานใหม่**
6. พิมพ์งานเป็นภาษาไทยตามปกติ
7. ตรวจคำตอบหรือร่างในแถบ **ผลงาน**
8. แก้ไขเองก่อนกด **ส่งออก** หรือใช้ต่อ

ตัวอย่างงานแรก:

> ช่วยตรวจเอกสารนี้ก่อนส่ง สรุปจุดที่ขาดและสิ่งที่ฉันต้องแก้เอง

หรือ:

> สรุปการประชุมนี้ แยกมติ งานที่ต้องทำ ผู้รับผิดชอบ วันครบกำหนด และเรื่องที่ยังรอยืนยัน

STeP AI จะเลือก Skill หรือ Playbook ที่เหมาะสมให้เองในงานส่วนใหญ่ ไม่จำเป็นต้องเลือกจากรายการก่อนทุกครั้ง

## หน้าตา STeP Desktop

![STeP Desktop Workspace พร้อมบทสนทนาและแถบผลงาน](docs/images/gui/02-workspace.png)

> ภาพจาก Electron build จริงของ STeP Desktop โดยใช้ข้อมูลตัวอย่างสำหรับเอกสารนี้

---

# 1. ติดตั้ง STeP Desktop

## Windows

ไฟล์ติดตั้งมีรูปแบบ:

```text
STeP-Desktop-Setup-<version>.exe
```

เปิดไฟล์ติดตั้ง แล้วทำตามขั้นตอนบนหน้าจอ ตัวติดตั้งเป็นแบบ per-user และสร้าง shortcut ให้ตามการตั้งค่าของ installer

## macOS

ไฟล์มีรูปแบบ:

```text
STeP-Desktop-<version>-arm64.dmg
STeP-Desktop-<version>-x64.dmg
```

เลือกให้ตรงกับเครื่อง จากนั้นเปิด DMG และย้าย **STeP Desktop** ไปที่ Applications

หาก macOS แสดงคำเตือนเกี่ยวกับผู้พัฒนา ให้ตรวจว่าไฟล์มาจากช่องทางที่องค์กรอนุมัติก่อน แล้วใช้ขั้นตอนที่ผู้ดูแลกำหนด อย่าข้ามคำเตือนให้ไฟล์ที่ไม่ทราบแหล่งที่มา

## ถอนการติดตั้ง

- **Windows:** Settings → Apps → STeP Desktop → Uninstall จะมีหน้าให้เลือก **"ลบประวัติงาน การเชื่อมต่อ AI และการตั้งค่าด้วย"** ค่าเริ่มต้นคือไม่ติ๊ก ข้อมูลจะเก็บไว้ ติดตั้งใหม่แล้วงานเดิมกลับมา ถ้าจะคืนเครื่องหรือเป็นเครื่องที่ใช้ร่วมกันให้ติ๊ก การอัปเดตรุ่นไม่ลบข้อมูลเด็ดขาด
- **macOS:** ลาก STeP Desktop จาก Applications ไปถังขยะ ข้อมูลยังอยู่ที่ `~/Library/Application Support/STeP Desktop` ถ้าต้องการลบด้วยให้ลบโฟลเดอร์นั้นเอง
- ทั้งสองระบบไม่ลบไฟล์ผลงานในโฟลเดอร์งาน (`output/`) และโปรไฟล์ที่ใช้ร่วมกับ STeP Skills (`~/.step-ai/profile.json`)

## แหล่งที่ควรใช้

ชุดสำหรับพนักงานต้องมาจาก **Shared Drive หรือช่องทางภายใน** ที่ระบุว่าอนุมัติให้ใช้แล้ว

อย่าใช้ไฟล์จาก Public GitHub Release แทนชุดภายในโดยถือว่าได้รับอนุมัติอัตโนมัติ เพราะ “มี release” กับ “อนุมัติให้พนักงานใช้” เป็นคนละขั้นตอน

---

# 2. Setup Wizard ครั้งแรก

เมื่อเปิด STeP Desktop ครั้งแรก ระบบจะพาผ่าน 6 ขั้นตอน

| ขั้นตอน | สิ่งที่ตั้งค่า |
| --- | --- |
| 1. ต้อนรับ | ภาพรวมว่าข้อมูลและร่างเก็บอย่างไร |
| 2. เกี่ยวกับคุณ | ชื่อเรียกและทีมหลัก |
| 3. ผู้ช่วย AI | ชื่อผู้ช่วยและสไตล์การพูด |
| 4. เชื่อมต่อ AI | ChatGPT / Gemini / Claude / API |
| 5. โฟลเดอร์และส่วนเสริม | Workspace และ OCR แบบ optional |
| 6. เสร็จสิ้น | เข้าใช้งานหรือเปิด Tour |

ทีมหลักช่วย Router เลือก Skill ที่ตรงบริบทของคุณมากขึ้น แต่ถ้ายังไม่แน่ใจสามารถเลือกภายหลังได้

ชื่อผู้ช่วยและสไตล์การพูดสามารถเปลี่ยนได้ใน **ตั้งค่าพื้นที่ทำงาน**

![Setup Wizard ของ STeP Desktop](docs/images/gui/01-setup-wizard.png)

*Setup Wizard จริงของ STeP Desktop — เริ่มจากข้อมูลผู้ใช้ ผู้ช่วย AI การเชื่อมต่อ และส่วนเสริม*

---

# 3. เชื่อมต่อ AI

เปิด:

**ตั้งค่าพื้นที่ทำงาน → การเชื่อมต่อ AI**

STeP Desktop รองรับหลายวิธี โดยแต่ละ connection แยก profile ออกจากกัน

| ใช้บัญชี/คีย์ | เลือก | ค่าใช้จ่าย |
| --- | --- | --- |
| ChatGPT Plus/Pro | **ChatGPT** → ลงชื่อผ่าน browser | ใช้แพ็กเกจที่มี |
| Claude Pro/Max | ส่งงานต่อให้ Claude Code (ต้องติดตั้ง Claude Code) หรือบนเครื่อง Pilot ใช้ **แพ็กเกจของคุณผ่าน Claude Code** ในแอป | ใช้แพ็กเกจที่มี |
| OpenRouter | **OpenRouter** → ลงชื่อผ่าน browser ไม่ต้องคัดลอกคีย์ | เติมเงินตามใช้ มีโมเดลฟรีบางตัว |
| Gemini | **Gemini** → API key จาก Google AI Studio | มีแบบใช้ฟรี |
| Claude API / OpenAI API | API key จาก Anthropic Console / OpenAI Platform | คิดตามการใช้ |
| อื่น ๆ | DeepSeek, Qwen (Alibaba Cloud), MiniMax, Groq, Mistral, xAI Grok หรือ Ollama (รันในเครื่อง) ใส่คีย์ของตัวเอง | ตามผู้ให้บริการ |

Qwen ใช้คีย์จาก Alibaba Cloud Model Studio **ภูมิภาค International (สิงคโปร์)** และ MiniMax ใช้คีย์จาก **platform.minimax.io** คีย์จากฝั่งจีน (Beijing / minimaxi.com) ใช้กับปุ่มนี้ไม่ได้

### ChatGPT

เลือก **ChatGPT** แล้วกด **เชื่อมต่อ ChatGPT** browser จะเปิดหน้าลงชื่อเข้าใช้ เมื่อเสร็จ STeP Desktop จะตรวจสถานะบัญชีและทดสอบ connection

### Gemini

บัญชี Google ส่วนตัวและ Google AI Plus/Pro **ลงชื่อเข้า Gemini ใน STeP Desktop ไม่ได้แล้ว** เพราะ Google หยุดให้บริการ Gemini CLI กับบัญชีเหล่านี้ตั้งแต่ 18 มิ.ย. 2569 ให้ใช้วิธีใดวิธีหนึ่ง:

- **Gemini API key** — สร้างที่ Google AI Studio (มีแบบใช้ฟรี แต่โควตาต่ำ) แล้วเลือก **Gemini** ในหน้าเชื่อมต่อ
- **บัญชีองค์กร** ที่มี Gemini Code Assist Standard/Enterprise — เลือก Gemini → บัญชีองค์กร แล้วใส่ **Google Cloud Project ID**
- ถ้าอยากใช้แพ็กเกจ Google AI Plus/Pro ของตัวเอง ให้ใช้ STeP Skills ใน **Google Antigravity** ([หัวข้อ 13](#13-ใช้-step-skills-ใน-claude-codex-หรือ-antigravity))

### Claude

มี 3 แนวทางหลัก:

- **แพ็กเกจของคุณผ่าน Claude Code (เฉพาะเครื่อง Pilot)** — STeP รัน Claude Code ตัวจริงเบื้องหลัง คุณลงชื่อบัญชี Claude ในหน้าของ Anthropic เอง ใช้โควตาแพ็กเกจของคุณ STeP ไม่เห็นรหัสผ่านหรือ token ปิดเป็นค่าเริ่มต้นระหว่างรอ Anthropic ยืนยันเงื่อนไข ([รายละเอียด วิธีเปิดบนเครื่อง Pilot และเงื่อนไข](docs/claude-subscription.md))
- **ส่งงานต่อให้ Claude Code** — STeP Desktop คัดลอกงานและเปิด Claude Code ในโฟลเดอร์งาน
- **Claude Console OAuth** — ไม่ต้องใส่ API key แต่ใช้ billing/quota ของ Claude Console/API workspace
- **API key**

### OpenRouter

เลือก **OpenRouter** แล้วกด **ลงชื่อด้วย OpenRouter** browser จะเปิดหน้าอนุญาต เมื่อกดอนุญาตแล้ว STeP Desktop ได้คีย์โดยไม่ต้องคัดลอกเอง จากนั้นเลือกโมเดลจากรายการ

การเชื่อมต่อแต่ละรายการมีปุ่ม **เชื่อมต่อ**, **โหลดรายชื่อโมเดล**, **ออกจากระบบ** และ **ลบ**

![หน้าการเชื่อมต่อ AI ใน STeP Desktop](docs/images/gui/05-ai-connections.png)

*หน้าการเชื่อมต่อ AI จริง แสดงสถานะบัญชี โมเดล และการเพิ่ม connection ใหม่*

---

# 4. รู้จักหน้าจอหลัก

STeP Desktop แบ่งการทำงานหลักเป็น 3 ส่วน

```text
┌────────────────┬────────────────────────────┬──────────────────────┐
│ งาน / เครื่องมือ │        บทสนทนา AI          │        ผลงาน          │
│                │                            │                      │
│ งานทั้งหมด      │ Prompt / Attach / Model    │ ร่างที่แก้ไขได้       │
│ มีผลงาน         │ Reasoning / Status         │ Version history      │
│ Skill           │                            │ Sources              │
│ ใบเสร็จ AFP     │                            │ Export               │
└────────────────┴────────────────────────────┴──────────────────────┘
```

## แถบซ้าย — งานและเครื่องมือ

ใช้สำหรับ:

- **เริ่มงานใหม่**
- ค้นหางานหรือเนื้อหา
- ดู **งานทั้งหมด**
- กรองเฉพาะงานที่ **มีผลงาน**
- ปักหมุด เปลี่ยนชื่อ หรือลบงาน
- เปิด **ศูนย์รวม Skill**
- เปิด **ตรวจใบเสร็จ AFP**
- เปิด **ตั้งค่าพื้นที่ทำงาน**

การกด **เริ่มงานใหม่** หมายถึงเริ่ม task context ใหม่ งานก่อนหน้าจะไม่ถูกนำมาปะปนโดยอัตโนมัติ

## ตรงกลาง — คุยกับ AI

กล่องพิมพ์รองรับ:

- พิมพ์คำขอภาษาไทยตามธรรมชาติ
- แนบเอกสาร
- เลือก AI connection
- เลือก model
- เลือก reasoning level ถ้า provider รองรับ
- พิมพ์ `/` เพื่อเลือก Skill โดยตรง
- กด Enter เพื่อส่ง และ Shift+Enter เพื่อขึ้นบรรทัดใหม่
- หยุดงานที่กำลังทำได้

โดยปกติ **ไม่ต้องเลือก Skill เอง** Router จะดูงานล่าสุดแล้วเลือก Skill/Playbook ที่เหมาะสม

ใช้ `/skill-name` เฉพาะเมื่อคุณต้องการบังคับวิธีทำงาน เช่น ต้องการใช้ Skill เฉพาะเจาะจง

## แถบขวา — ผลงาน

กด **เปิดร่าง** เพื่อดูพื้นที่ผลงาน

เมื่อ AI เสนอร่าง คุณสามารถ:

1. อ่านข้อเสนอ
2. กด **ใช้ร่างนี้** หรือ **ไม่ใช้**
3. แก้ไขข้อความเอง
4. จัดหัวข้อ ตัวหนา ตัวเอียง รายการ หรือลำดับ
5. ดู Version history และคืนเวอร์ชันเก่า
6. ดูแหล่งอ้างอิงที่ใช้
7. ส่งออกเป็น `DOCX`, `PDF`, `MD`, `XLSX` หรือ `PPTX`

AI ไม่เขียนทับร่างของคุณเงียบ ๆ ข้อเสนอใหม่จะถูกเก็บเป็น proposal ให้คุณเลือกก่อน

---

# 5. วิธีทำงานประจำวันที่แนะนำ

## งานทั่วไป

กด **เริ่มงานใหม่** แล้วบอก:

> ช่วยร่างอีเมลตอบกลับเรื่องนี้ให้สุภาพและกระชับ

งานทั่วไปที่ไม่ต้องใช้ workflow เฉพาะจะทำงานในโหมด General

## ตรวจเอกสาร

1. กด **เริ่มงานใหม่**
2. กดรูปคลิปหนีบกระดาษ
3. เลือกเอกสาร
4. ตรวจ preview/ข้อความที่ระบบอ่านได้
5. พิมพ์สิ่งที่ต้องการ เช่น

> ช่วยตรวจเอกสารนี้ก่อนส่ง สรุปจุดที่ขาดและสิ่งที่ฉันต้องแก้เอง

STeP Desktop จำกัดหนึ่ง source attachment ต่อ request สำหรับ workflow ที่ต้องรักษา source ชัดเจน หากต้องรวมหลายเอกสารควรบอกเจตนาให้ชัดหรือแยกงาน

## สรุปประชุม

> สรุปการประชุมนี้ แยกมติ งานที่ต้องทำ ผู้รับผิดชอบ วันครบกำหนด และเรื่องที่ยังรอยืนยัน

## หนังสือ/ข้อความราชการ

> ร่างหนังสือขอความอนุเคราะห์ใช้สถานที่ด้วยภาษาสุภาพ กระชับ และให้ฉันตรวจทานก่อนส่ง

## TOR / งานจัดซื้อ

> ช่วยตรวจ TOR นี้ แยกข้อเท็จจริง ความเสี่ยง และข้อมูลที่ต้องให้เจ้าของงานยืนยันก่อนส่ง AFP

## TOR → Project Plan

> เอา TOR นี้มาแตกกิจกรรม ระยะเวลา milestone และ dependency แล้วเตรียมแผนสำหรับทำ Gantt

งานลักษณะนี้สามารถเข้า Playbook หลายขั้นแทนการใช้ Skill เดี่ยว

## Privacy review

> ช่วยตรวจเอกสารนี้ว่ามีข้อมูลส่วนบุคคลหรือ credential ที่ไม่ควรส่งต่อหรือไม่ และเสนอจุดที่ควรปิดบัง

## ISO / QMS

> ช่วยเตรียมเอกสารสำหรับ audit ISO ปีนี้

ถ้า Harness ไม่มี controlled source ที่จำเป็น ระบบควรระบุว่า source ยังไม่พร้อม แทนการเดาระเบียบหรือข้อกำหนด

---

# 6. ศูนย์รวม Skill

เปิด **ศูนย์รวม Skill** จากแถบซ้าย

หน้านี้ใช้สำหรับดูว่า STeP AI มีวิธีทำงานอะไรอยู่บ้าง และ Skill ใดเกี่ยวข้องกับทีมของคุณ

วิธีใช้มี 2 แบบ:

**แบบปกติ — พิมพ์งานตรง ๆ**

> ช่วยตรวจ TOR นี้ก่อนส่ง AFP

Router จะเลือก Skill ให้

**แบบเลือกเอง**

เปิด Skill แล้วกดใช้ หรือพิมพ์ `/` ในช่องข้อความแล้วเลือก Skill

เหมาะเมื่อคุณรู้ว่าต้องการ workflow ใดแน่นอน

![ศูนย์รวม Skill ของ STeP Desktop](docs/images/gui/03-skill-hub.png)

*Skill Hub จริง แสดง Skill ที่ Router ใช้ได้ สถานะ Manifest/Routing และ Skill ของทีมผู้ใช้*

---

# 7. ตรวจใบเสร็จก่อนส่ง AFP

เปิด:

**เครื่องมือ → ตรวจใบเสร็จ AFP**

OCR เป็นส่วนเสริมหลังติดตั้ง STeP Desktop คนที่ไม่ใช้ไม่ต้องดาวน์โหลด runtime OCR

![หน้าตรวจใบเสร็จก่อนส่ง AFP](docs/images/gui/04-receipt-afp.png)

*หน้า Receipt AFP จริงก่อนติดตั้ง OCR — ผู้ใช้ติดตั้งส่วนเสริมเฉพาะเครื่องที่ต้องใช้*

## ครั้งแรก

กด **ติดตั้ง OCR**

ระบบจะเตรียม Python/PaddleOCR และโมเดลที่จำเป็นไว้ใน App Data ของผู้ใช้ หลังติดตั้งแล้วจึงเปิด local OCR service

หากต้องอ่านลายมือ กด **เพิ่มอ่านลายมือ** เพื่อเพิ่ม Thai-TrOCR ภายหลัง

ถ้าเครื่องมี **Tesseract 5 พร้อมภาษา tha + eng** ระบบจะตรวจพบและใช้เป็นตัวตรวจซ้ำสำหรับข้อความพิมพ์/ตัวเลขโดยอัตโนมัติ

## ขั้นตอนตรวจใบเสร็จ

1. กด **เลือกใบเสร็จ**
2. เลือก PDF, PNG, JPG, WebP, BMP หรือ TIFF
3. OCR อ่านเอกสารบนเครื่อง
4. ระบบ map ข้อมูลเข้า field เช่น ร้านค้า, เลขที่ใบเสร็จ, วันที่, Tax ID, subtotal, VAT และ total
5. ถ้าหลาย engine อ่านไม่ตรงกัน ระบบจะแสดง candidate และไม่เดาแทนคุณ
6. เทียบค่ากับภาพต้นฉบับ
7. ติ๊ก **ตรวจแล้ว** ในช่องที่ยืนยันแล้ว
8. กด **AI กรอง OCR อีกชั้น** ได้ถ้าต้องการ
9. กด **ให้ AI pre-check ต่อ** เพื่อสร้าง Workspace งานตรวจใบเสร็จ

### OCR หลายชั้น

```text
PaddleOCR          → OCR หลัก
Tesseract          → ตรวจซ้ำตัวพิมพ์และตัวเลข
Thai-TrOCR         → candidate สำหรับลายมือ
EasyOCR (optional) → second opinion
        ↓
AFP field mapping
        ↓
mapped / ambiguous / unmapped
```

Tesseract ไม่ได้ถูกใช้เป็น handwriting authority และ candidate จากลายมืออย่างเดียวจะไม่ถูก auto-confirm

### AI กรอง OCR อีกชั้น

ปุ่ม **AI กรอง OCR อีกชั้น** ใช้ AI connection ที่คุณเลือกอยู่เพื่อช่วยตัดสิน semantic mapping แต่มีข้อจำกัด:

- ไม่ส่งภาพใบเสร็จให้ AI resolver
- ข้อมูล OCR ผ่าน privacy filtering ก่อน
- candidate value ถูกแทนด้วย local token
- AI เลือกได้เฉพาะ candidate ที่ OCR สร้างไว้
- AI ไม่มีสิทธิสร้างยอดเงิน, Tax ID, วันที่ หรือเลขเอกสารใหม่
- ถ้าไม่แน่ใจต้องคืน `ambiguous` / `unmapped`
- ค่าที่ AI แนะนำยังเป็น **unconfirmed** จนกว่าคนจะตรวจ

เมื่อส่งต่อไป Workspace ระบบเก็บ `afp_mapping`, candidate, evidence และ unmapped OCR lines ไว้ด้วย จึงไม่ตีความว่า “ช่องว่าง = OCR ไม่พบข้อมูล” โดยอัตโนมัติ

---

# 8. Context และ Workspace

แต่ละงานในแถบซ้ายคือ Workspace session ของตัวเอง

กติกาหลัก:

- **เริ่มงานใหม่** → เริ่ม context ใหม่
- ถามต่อในงานเดิม → ใช้เฉพาะ context ที่เกี่ยวข้องกับงานนั้น
- ถ้าเปลี่ยนหัวข้อแบบไม่เกี่ยวข้อง → Harness ไม่ควรลาก Skill/source เก่ามาปน
- ถ้าพูดว่า “เรื่องเมื่อกี้”, “ต่อจากเดิม”, “ใบเสร็จเมื่อกี้” → ระบบสามารถเชื่อม context ที่เกี่ยวข้องกลับมา
- structured source เช่น receipt JSON จะอยู่กับ Workspace และใช้ต่อใน follow-up ของงานเดียวกัน

แนวทางนี้ช่วยลดปัญหา Context Bleed เช่น คุยเรื่องใบเสร็จแล้วถามเรื่องระเบียบใหม่ แต่ AI ยังตอบติดบริบทใบเสร็จ

---

# 9. Privacy และจุดยืนยัน

ก่อนส่งข้อมูลไป AI, STeP Desktop มี privacy review และจุดยืนยันตามลักษณะงาน

ใช้เฉพาะโปรแกรม AI และช่องทางที่องค์กรอนุมัติ

**ห้ามใส่รหัสผ่าน, token, cookie, MFA หรือ secret**

ถ้าระบบแจ้งข้อมูลความเสี่ยงสูง ให้หยุดและตรวจเจ้าของข้อมูล/สิทธิ์ก่อนดำเนินการ

ตัวอย่างขอบเขต:

| งาน | พฤติกรรมที่คาดหวัง |
| --- | --- |
| สรุป วิเคราะห์ ร่างเอกสาร | AI ช่วยทำร่างได้ |
| กรอกฟอร์มแต่ยังไม่ Submit | เตรียมข้อมูลได้ |
| กด Submit / ส่งอีเมลแทน | ต้องให้คนยืนยัน |
| อนุมัติเบิกเงินจริง | AI ทำแทนไม่ได้ |
| เลือกผู้ชนะจัดซื้อ | AI ทำแทนไม่ได้ |
| ปิด NC/CAPA ทางการ | AI ทำแทนไม่ได้ |
| ออกรายงานผลแล็บอย่างเป็นทางการ | AI ทำแทนไม่ได้ |
| ให้คะแนน/จัดอันดับพนักงาน | AI ทำแทนไม่ได้ |

รายละเอียดเพิ่มเติม: [Privacy preflight](docs/privacy-preflight.md) · [Action verification](docs/action-verification.md)

---

# 10. ทำไมบางครั้ง AI บอกว่า Source ยังไม่พร้อม

Harness แยก “รู้วิธีทำงาน” ออกจาก “มี source ที่อนุมัติให้อ้างได้”

ตัวอย่าง:

- รู้วิธีตรวจ TOR ไม่ได้แปลว่ามีระเบียบพัสดุฉบับล่าสุด
- รู้วิธีตรวจใบเสร็จไม่ได้แปลว่ามีเพดาน/สิทธิเบิกที่ยืนยันแล้ว
- รู้วิธีเตรียม ISO audit ไม่ได้แปลว่ามี controlled QMS documents ทุกฉบับ
- ISO 9001:2015 อาจถูกระบุเป็น normative source แต่ตัวข้อความมาตรฐานไม่ได้อยู่ใน package

เมื่อ source ที่ต้องใช้ยังไม่มี ระบบควรแสดง `partial`, `NEED-SOURCE` หรือคำเตือนที่เทียบเท่า แทนการสร้างข้อกำหนดขึ้นเอง

---

# 11. เมื่อมีปัญหา

## AI ยังไม่พร้อม

ดู status bar ด้านล่าง ถ้าแสดง **ยังไม่เชื่อมต่อ AI**

ไปที่:

**ตั้งค่าพื้นที่ทำงาน → การเชื่อมต่อ AI**

แล้วกดเชื่อมต่อ/ทดสอบใหม่

## Login เปิด browser แต่กลับเข้าแอปไม่ได้

ลอง **ยกเลิก** แล้วเชื่อมใหม่

ปล่อยหน้าลงชื่อใน browser ทำงานจนขึ้นว่าสำเร็จ ไม่ต้องนำ authorization code มาวางเอง ถ้าเป็นบัญชี Google ส่วนตัวที่ขึ้นว่าหยุดให้บริการ ให้เปลี่ยนไปใช้ Gemini API key (ดูหัวข้อ 3)

## OCR ไม่พร้อม

เปิด **ตรวจใบเสร็จ AFP**

- ถ้ายังไม่ติดตั้ง → กด **ติดตั้ง OCR**
- ติดตั้งแล้วแต่ service ปิด → กด **เปิดบริการ OCR**
- ต้องอ่านลายมือ → กด **เพิ่มอ่านลายมือ**
- ต้องการ Tesseract → ใช้ปุ่ม **วิธีติดตั้ง** แล้วติดตั้ง `tha + eng`

## AI เลือกงานผิด

เริ่มจากเขียน intent ให้ชัด เช่น:

> ตรวจ TOR นี้เรื่องขอบเขตงานและเกณฑ์ตรวจรับ

ถ้าต้องการบังคับ ให้พิมพ์ `/` แล้วเลือก Skill โดยตรง

## งานหนึ่งปนกับอีกงานหนึ่ง

กด **เริ่มงานใหม่** เมื่อต้องการเปลี่ยน task จริง ๆ

## ส่งปัญหาให้ผู้ดูแล

ถ่ายภาพหน้าจอพร้อมข้อความผิดพลาด โดยปิดบังข้อมูลอ่อนไหว แล้วส่งผ่าน [STeP AI Support](SUPPORT.md)

---

# 12. สิ่งที่ควรรู้ก่อนนำผลลัพธ์ไปใช้

STeP AI เป็น workspace สำหรับช่วยเตรียมงาน ไม่ใช่ผู้มีอำนาจอนุมัติ

ก่อนใช้ผลลัพธ์:

- ตรวจข้อเท็จจริง
- ตรวจ source
- ตรวจตัวเลข/ชื่อ/วันที่
- ตรวจว่าคุณมีสิทธิ์ส่งข้อมูลนั้น
- ตรวจร่างก่อนส่งออกหรือเผยแพร่
- งานที่มีผลทางการเงิน จัดซื้อ QMS บุคลากร หรือการรับรอง ต้องให้ผู้มีอำนาจจริงเป็นผู้ตัดสิน

---

# 13. ใช้ STeP Skills ใน Claude, Codex หรือ Antigravity

ถ้าคุณใช้โปรแกรม AI เหล่านี้อยู่แล้ว ติดตั้ง Skills และกติกาของ STeP ลงไปได้เลย ไม่ต้องติดตั้ง STeP Desktop พิมพ์งานภาษาไทยตามปกติ โปรแกรมจะเลือก Skill ที่ตรงกับงานเอง และทำตามกติกาเดียวกับ Desktop: มนุษย์อนุมัติเอง ไม่ส่งข้อมูลส่วนบุคคลหรือความลับ และเก็บผลงานในโฟลเดอร์ที่กำหนด

| โปรแกรม | บัญชีที่ใช้ได้ | ต้องมีเพิ่ม |
| --- | --- | --- |
| **Claude** Code / Desktop | Claude Pro, Max, Team, Enterprise | — |
| **Codex** | ChatGPT Plus, Pro, Business, Enterprise | Node.js (ครั้งเดียว) |
| **Google Antigravity** | บัญชี Google รวม Google AI Plus/Pro | Node.js (ครั้งเดียว) |

## วิธีง่ายที่สุด: ดับเบิลคลิกไฟล์เดียว

1. ติดตั้งโปรแกรม AI ที่จะใช้ (Claude Code, Codex หรือ Antigravity) และเปิดอย่างน้อยหนึ่งครั้ง
2. ติดตั้ง [Node.js](https://nodejs.org) รุ่น LTS (ครั้งเดียว ถ้ายังไม่มี ไฟล์ในข้อ 4 จะเปิดหน้าดาวน์โหลดให้)
3. เปิด github.com/iisara555/STeP-AI-Harness กด **Code → Download ZIP** แล้วแตกไฟล์
4. ดับเบิลคลิก **`Setup-STeP-Skills.bat`** (Windows) หรือ **`Setup-STeP-Skills.command`** (macOS)
5. ตอบ 4 คำถามเรื่องโปรไฟล์ (Enter ข้ามได้) แล้วเริ่มแชตใหม่

ไฟล์นี้ติดตั้ง Skills ลงทุกโปรแกรมที่พบในเครื่อง ใส่กติกาของ Codex ติดตั้ง Antigravity แบบใช้ได้ทุก workspace และตั้งโปรไฟล์ในครั้งเดียว โปรแกรมที่ไม่มีจะถูกข้ามพร้อมบอกวิธีทำเอง ดับเบิลคลิกซ้ำเมื่อต้องการอัปเดตหรือแก้โปรไฟล์

- Windows ขึ้นหน้าต่าง "Windows protected your PC": กด **More info → Run anyway** (ไฟล์มาจาก repository นี้)
- macOS ขึ้นว่าเปิดไม่ได้เพราะไม่รู้จักผู้พัฒนา: เปิด **System Settings → Privacy & Security** เลื่อนลงไปกด **Open Anyway** แล้วดับเบิลคลิกอีกครั้ง (macOS 15 ขึ้นไปไม่มีทางลัดคลิกขวา → Open แล้ว)

วิธีด้านล่างคือการติดตั้งทีละโปรแกรมด้วยคำสั่ง สำหรับคนที่ถนัด terminal

## Claude

ใน Claude Code พิมพ์:

```text
/plugin marketplace add iisara555/STeP-AI-Harness
/plugin install step@step-ai
```

เริ่มแชตใหม่ แล้วพิมพ์งานตามปกติ หรือเรียก Skill เองด้วย `/step:<ชื่อ>` เช่น `/step:meeting-summary` อัปเดตด้วย `/plugin marketplace update step-ai`

## Codex

```text
codex plugin marketplace add iisara555/STeP-AI-Harness
codex plugin add step@step-ai
```

จากนั้นดาวน์โหลด repository นี้ (`git clone` หรือ **Code → Download ZIP** บน GitHub) แล้วรันในโฟลเดอร์นั้นครั้งเดียว เพื่อใส่กติกาของ STeP ลง `~/.codex/AGENTS.md` (Codex ไม่รัน hook ของ plugin):

```text
node scripts/install-agent-skills.mjs codex
```

อัปเดตด้วย `codex plugin marketplace upgrade`

## Google Antigravity

ดาวน์โหลด repository นี้เหมือนกัน แล้วรันในโฟลเดอร์นั้น:

```text
node scripts/install-agent-skills.mjs antigravity
```

ติดตั้งครั้งเดียวใช้ได้**ทุก workspace** ปิดแล้วเปิด Antigravity ใหม่ Skills อยู่ที่ `~/.gemini/config/skills/` ไฟล์กติกาเต็มที่ `~/.gemini/config/step/` และกติกาฉบับย่อถูกเพิ่มท้าย `~/.gemini/GEMINI.md` (กติกา global ของ Antigravity ข้อความเดิมในไฟล์นั้นยังอยู่) อัปเดตด้วยการดาวน์โหลดรุ่นใหม่แล้วรันคำสั่งเดิมซ้ำ Skills ของคุณเองจะไม่ถูกแตะ

ถ้าต้องการให้มีเฉพาะบาง workspace ให้ระบุโฟลเดอร์ต่อท้าย เช่น `node scripts/install-agent-skills.mjs antigravity ~/Documents/งานSTeP` จะลงที่ `.agents/` ของโฟลเดอร์นั้นแทน ใช้แบบใดแบบหนึ่ง ไม่ต้องทั้งสองแบบ จะได้ไม่มี Skill ซ้ำ

## ตั้งโปรไฟล์ (แทน USER.md)

ให้ AI รู้ชื่อเรียก ทีม ชื่อผู้ช่วย และสไตล์การคุยของคุณ รันครั้งเดียวในโฟลเดอร์ของ repository หลังติดตั้งโปรแกรมแล้ว:

```text
node scripts/install-agent-skills.mjs profile
```

ตอบ 4 คำถาม (กด Enter ข้ามได้ทุกข้อ) ระบบบันทึกเป็นบล็อก "ข้อมูลผู้ใช้ STeP" ลงไฟล์คำสั่งประจำของทุกโปรแกรมที่พบในเครื่อง: `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.gemini/GEMINI.md` ใช้ได้ทุกแชตทุกโฟลเดอร์ ทีมที่เลือกใช้เป็นโฟลเดอร์ผลงาน เช่น `output/CC/...` รันซ้ำเมื่อต้องการแก้ ข้อความอื่นในไฟล์เหล่านั้นไม่ถูกแตะ ถ้าโฟลเดอร์งานมี `USER.md` จากชุด STeP รุ่นเดิม AI จะใช้ไฟล์นั้นแทน

โปรไฟล์นี้ใช้ร่วมกับ **STeP Desktop** ผ่านไฟล์ `~/.step-ai/profile.json`: ถ้าตั้งใน Setup ก่อน Desktop จะเติมค่าให้ในหน้าตั้งค่าครั้งแรก ถ้าแก้ใน Desktop รอบถัดไปที่รัน Setup จะเสนอค่าที่แก้เป็นค่าเดิม กด Enter ก็ใช้ได้เลย ห้ามใส่เลขบัตรประชาชน เบอร์โทร หรือรหัสผ่าน ระบบจะไม่รับตัวเลขยาว ความจำจากงานก่อน ๆ (แบบ `MEMORY.md` เดิม) ให้ใช้ระบบความจำของแต่ละโปรแกรม

## ถอน STeP Skills

ดับเบิลคลิก **`Uninstall-STeP-Skills.bat`** (Windows) หรือ **`Uninstall-STeP-Skills.command`** (macOS) ในโฟลเดอร์ที่ดาวน์โหลดไว้ หรือรัน `node scripts/install-agent-skills.mjs uninstall` ระบบจะ:

- ถอน Skills ออกจาก Claude และ Codex
- ลบเฉพาะกติกาและโปรไฟล์ที่ Setup เขียนไว้ใน `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` และ `~/.gemini/GEMINI.md` ข้อความที่คุณเขียนเองยังอยู่
- ลบ Skills ของ STeP ใน Antigravity แต่ Skills ที่คุณสร้างเองยังอยู่ ถ้าเคยติดตั้งแบบเฉพาะ workspace ให้ระบุโฟลเดอร์ต่อท้าย เช่น `node scripts/install-agent-skills.mjs uninstall ~/Documents/งานSTeP`
- ถามก่อนว่าจะลบโปรไฟล์ที่ใช้ร่วมกับ STeP Desktop ด้วยไหม (กด Enter = เก็บไว้)

ไฟล์ผลงานใน `output/` ไม่ถูกแตะ

รายละเอียดเพิ่มเติม: [plugins/step/README.md](plugins/step/README.md)

ข้อจำกัด: ไม่มีหน้าตรวจใบเสร็จ AFP, แถบผลงาน, Version history และการตรวจ privacy ก่อนส่งแบบใน STeP Desktop งานเหล่านี้ให้ใช้ Desktop

---

# 14. สำหรับผู้ดูแลและนักพัฒนา

README ส่วนบนตั้งใจให้เป็น **GUI-first employee guide** ส่วนรายละเอียดเชิงระบบยังอยู่ใน repo

## Version / inventory

README ฉบับนี้อ้างอิง Harness source **v0.7.6** และ STeP Desktop **v0.5.13**

| รายการใน Harness source | จำนวน |
| --- | --- |
| ทีม | **22 ทีม** |
| กลุ่ม routing | **5 กลุ่ม** |
| Skills | **51 Skills** |
| Playbooks | **5 Playbooks** |
| Actions | **4 Actions** |

Router มีเส้นทางเลือก Skill 50 รายการ ส่วน `step-router` เป็น routing/orchestration Skill

ต้นทาง: [Skills](manifest/skills.yaml) · [Router index](manifest/router-index.yaml) · [Playbooks](manifest/playbooks.yaml) · [Actions](manifest/actions.yaml)

ตารางนี้นับจาก source ไม่ใช่รายการรับรองของ ZIP ที่พนักงานได้รับ

## สถาปัตยกรรมโดยย่อ

```text
STeP Desktop GUI
      ↓
Current task / source
      ↓
Router
      ↓
Skill / Playbook
      ↓
Source readiness
      ↓
Authority + Privacy
      ↓
Provider
      ↓
Proposal / verified output
```

อ่านต่อ: [Architecture](docs/architecture.md) · [Router](docs/step-router.md) · [Playbooks](docs/playbooks.md)

## Repository visibility

repository นี้มีสถานะ **Public** จึงห้าม commit เอกสารภายใน, credential, token, ข้อมูลพนักงาน หรือข้อมูลลูกค้าที่ไม่ควรเผยแพร่

เผยแพร่แบบ open source ภายใต้ [MIT License](LICENSE) ทั้ง Harness, STeP Desktop และ STeP Skills ไฟล์ของบุคคลที่สามใน `src/vendor/privacy/` (ฟอนต์และ cmaps) ใช้ license ของตัวเองตามไฟล์ LICENSE ในโฟลเดอร์นั้น

## Release

ชุดติดตั้งที่แจกพนักงานมาจาก **release tag เท่านั้น** ไม่ใช่จาก `main`

การมี build หรือ GitHub Release ไม่ได้แปลว่าอนุมัติให้พนักงานใช้แล้ว ผู้ดูแลต้องผ่าน Release Gate และแจกผ่านช่องทางภายในที่อนุมัติ

ดู: [Pilot Operations](docs/pilot-operations.md) · [Pilot Runbook](docs/pilot-runbook.md) · [CHANGELOG](CHANGELOG.md)

## Development

Harness:

```sh
npm test
npm run validate
```

Desktop:

```sh
npm --prefix desktop ci
npm run desktop:build
npm run desktop:test
npm run desktop:start
```

รายละเอียด packaging และข้อจำกัดของ Electron build อยู่ใน [desktop/README.md](desktop/README.md)

## ดูแล STeP Skills plugin

ไฟล์ใน `plugins/step/` สร้างจาก `skills/`, `rules/`, `docs/` และ `manifest/` ด้วย `node scripts/build-claude-plugin.mjs` ห้ามแก้ใน `plugins/step/` โดยตรง หลังแก้ Skill ให้รันสคริปต์นี้ทุกครั้ง (`npm test` ตรวจว่า plugin ตรงกับต้นฉบับ) กติกาที่ขึ้นต้นทุกแชตแก้ที่ `plugin/session-brief.md` ส่วน `scripts/install-agent-skills.mjs` ลงชุดเดียวกันให้ Codex (กติกา) และ Antigravity (global หรือราย workspace)

Claude และ Codex ดึง plugin จาก `main` ของ repository นี้ การ merge เข้า `main` จึงเท่ากับปล่อย Skills รุ่นใหม่ให้คนที่ติดตั้ง plugin

## ช่องทางที่เลิกใช้แล้ว

- **ชุด ZIP + CLI `step-ai`** (`Install-STeP-AI.bat` / `.command`, `Update-STeP-AI.*`, `START-HERE.md`, `OPEN-IN-CODEX.md`) — เลิกแจกพนักงานใหม่แล้ว ถ้าดับเบิลคลิก `Install-STeP-AI` หรือ `Update-STeP-AI` ในชุดที่ดาวน์โหลดจาก GitHub ตัวเก่าจะบอกว่าเลิกใช้แล้วและเปิด `Setup-STeP-Skills` แทน (ชุด ZIP ของ Pilot ไม่มี Setup จึงทำงานแบบเดิม) ห้ามใช้ `export-ignore` ซ่อนไฟล์ เพราะ plugin directory ไม่รับ repository ที่มีกฎนี้ โค้ดยังอยู่เพราะ Router และ Skills ใน `src/` เป็นแกนที่ STeP Desktop ใช้ร่วม และผู้ทดสอบ Pilot รุ่นเก่ายังอัปเดตได้ ผู้ใช้เดิมให้ย้ายไป STeP Desktop หรือหัวข้อ 13
- **Gemini CLI extension** — ถอดออกแล้ว Google หยุดให้บริการ Gemini CLI กับบัญชีส่วนตัวและ Google AI Pro/Ultra ตั้งแต่ 18 มิ.ย. 2569 ใช้ Antigravity แทน
- **LINE gateway** (`gateway/line/`) — โค้ดทดลอง ยังไม่เคยเปิดใช้และไม่ใช่ช่องทางสำหรับพนักงาน

---

## เป้าหมายสำหรับผู้ใช้หลังอ่าน README นี้

ผู้ใช้ควร:

- ติดตั้งและเปิด STeP Desktop บน Windows หรือ macOS ได้
- ผ่าน Setup Wizard และเลือกทีมได้
- เลือกได้ว่าจะใช้ STeP Desktop หรือ STeP Skills ใน Claude / Codex / Antigravity
- เชื่อมต่อ ChatGPT, Claude, OpenRouter หรือ Gemini API key ได้ตามสิทธิ์ที่มี
- เริ่มงานใหม่และพิมพ์งานแรกเป็นภาษาไทยได้
- แนบเอกสารและรู้ว่าควรตรวจ source ก่อนใช้
- ตรวจ proposal และแก้ร่างในแถบ **ผลงาน** ได้
- ส่งออกไฟล์จาก GUI ได้
- ใช้ Skill โดยไม่ต้องจำชื่อทั้งหมด
- ใช้ **ตรวจใบเสร็จ AFP** และเข้าใจว่า OCR/AI candidate ยังต้องให้คนยืนยัน
- รู้ว่าเมื่อใดต้องหยุดให้มนุษย์ยืนยัน
- รู้ว่าจะส่งปัญหาผ่าน [STeP AI Support](SUPPORT.md) อย่างไร
