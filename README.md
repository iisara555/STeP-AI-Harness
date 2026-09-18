# STeP AI Harness

ชุด Skills, Rules และบริบทการทำงานสำหรับช่วยให้พนักงาน STeP ใช้ AI กับงานจริงได้ง่ายขึ้น โดยไม่ต้องจำ Prompt และไม่ต้องเริ่มอธิบายบริบทขององค์กรใหม่ทุกครั้ง

โครงการนี้พัฒนาสำหรับ **อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP / RSP North)** และอยู่ในช่วงทดลองใช้งานภายในองค์กร

**สถานะปัจจุบัน:** Pilot v0.7.0  
**ครอบคลุม:** 22 ทีม / 5 AI routing clusters / 43 Skills

[เริ่มใช้งานสำหรับพนักงาน](START-HERE.md) · [คู่มือฉบับเต็ม](docs/employee-guide.md) · [ดูรายชื่อทีม](docs/teams.md)

---

## ทำไมต้องมี STeP AI Harness

พนักงานแต่ละทีมใช้ AI ช่วยงานกันอยู่แล้ว แต่ปัญหาที่เจอบ่อยคือ AI ไม่รู้บริบทของ STeP ไม่รู้ว่าเอกสารแบบไหนต้องมีคนอนุมัติ ไม่รู้คำศัพท์หรือกระบวนการภายใน และผู้ใช้ต้องคอยอธิบายเรื่องเดิมซ้ำ ๆ

STeP AI Harness จึงทำหน้าที่เป็นชั้นกลางระหว่าง **คนทำงาน** กับ **AI ที่แต่ละคนเลือกใช้**

แทนที่จะรวมทุกอย่างไว้ใน Prompt ยาว ๆ ระบบแยกความรู้เป็นส่วนที่ดูแลและปรับปรุงได้ เช่น

- Skills สำหรับงานแต่ละประเภท
- Rules ที่ต้องใช้ร่วมกัน
- ข้อมูลทีมและเจ้าของกระบวนการ
- Process และ Authority ขององค์กร
- Router สำหรับเลือก Skill ที่เหมาะกับงาน
- บริบทส่วนตัวของผู้ใช้ภายใน Workspace

เป้าหมายคือให้พนักงานพิมพ์งานตามปกติ เช่น

> ช่วยตรวจ TOR นี้ก่อนส่ง

> สรุปประชุมเมื่อเช้า แยกสิ่งที่ต้องทำต่อ

> ช่วยคิด Art Direction งานนี้หน่อย มันยังดู AI เกินไป

> ช่วยดู feedback ลูกค้าชุดนี้ว่ามี pain point อะไรซ้ำกันบ้าง

แล้วให้ระบบเลือกวิธีช่วยที่เหมาะสมจากบริบทของงาน

---

## เริ่มใช้งาน

สำหรับพนักงานทั่วไป ไม่จำเป็นต้องใช้ Git หรือ Terminal

1. ดาวน์โหลด [`STeP-AI-Pilot-v0.7.0.zip`](https://github.com/iisara555/STeP-AI-Harness/releases/download/v0.7.0/STeP-AI-Pilot-v0.7.0.zip) จาก GitHub Releases หรือรับจาก Shared Drive ขององค์กร
2. แตกไฟล์
3. เปิดตัวติดตั้งสำหรับ Windows หรือ macOS
4. เปิดโฟลเดอร์ STeP AI ด้วยโปรแกรม AI ที่ใช้อยู่
5. พิมพ์งานเป็นภาษาไทยได้เลย

หากยังไม่เคยใช้งาน แนะนำให้อ่าน [START-HERE.md](START-HERE.md) ก่อน ใช้เวลาไม่นาน

### macOS

หลังแตก ZIP ให้ **คลิกขวา `Install-STeP-AI.command` → Open** ในครั้งแรก

หาก macOS แจ้งว่าไม่สามารถตรวจสอบผู้พัฒนาได้ ให้ไปที่ **System Settings → Privacy & Security → Open Anyway → Open**

ตั้งแต่ Pilot v0.7.0 ถ้าเครื่องยังไม่มี Node.js ตัวติดตั้งจะดาวน์โหลด Node 22 runtime สำหรับ Apple Silicon/Intel มาไว้ **เฉพาะในโฟลเดอร์ STeP AI** พร้อมตรวจ SHA-256 โดยอัตโนมัติ จึงไม่ต้องติดตั้ง Homebrew, Node.js หรือใช้ Terminal เอง

ดูไฟล์ `MAC-START-HERE.txt` หากเปิดตัวติดตั้งไม่ได้

### ครั้งแรก

ผู้ช่วยมีชื่อเริ่มต้นว่า **STeP Mate**

สามารถตั้งชื่อใหม่ เลือกวิธีคุย และบอกชื่อที่ต้องการให้เรียกได้ เช่น

> เรียกตัวเองว่า Friday

> คุยกับผมแบบเพื่อนร่วมงาน

> ตอบให้สั้นกว่านี้

การตั้งค่าเหล่านี้มีผลกับวิธีสื่อสารเท่านั้น ไม่เปลี่ยนกฎการอนุมัติ ความปลอดภัย หรือขอบเขตอำนาจของ AI

ถ้าไม่อยากตั้งค่าก็ข้ามได้และเริ่มทำงานทันที

---

## ใช้กับโปรแกรมอะไรได้บ้าง

Harness ไม่ได้ออกแบบให้ผูกกับ AI รายเดียว

ตัวติดตั้งมี Adapter สำหรับเครื่องมือหลายแบบ เช่น

- ChatGPT
- Claude
- Codex
- Cursor
- OpenCode
- Windsurf
- Gemini
- Hermes

ถ้ามีโปรแกรมที่ใช้อยู่แล้ว ไม่จำเป็นต้องเปลี่ยนเครื่องมือเพื่อใช้ STeP AI

หลักของโครงการคือให้ **ความรู้และกติกาของ STeP อยู่กับ Workspace** มากกว่าผูกกับผู้ให้บริการ AI รายใดรายหนึ่ง

---

## การอัปเดตเวอร์ชัน

ตั้งแต่ **Pilot v0.4** ไฟล์ `Update-STeP-AI.bat` (Windows) และ `Update-STeP-AI.command` (macOS) จะตรวจสอบ GitHub Releases ก่อนทุกครั้ง

```text
Current version
      ↓
Check GitHub Releases
      ↓
มีรุ่นใหม่?
 ├─ ไม่มี → Sync Skills / Rules / Router ในเครื่อง
 └─ มี
      ↓
 Download versioned ZIP
      ↓
 Verify SHA-256 (ถ้ามี)
      ↓
 Backup รุ่นเดิม
      ↓
 Preserve USER.md / MEMORY.md / output/
      ↓
 Apply new version
      ↓
 Sync Workspace + Doctor
```

ถ้าอินเทอร์เน็ตหรือ GitHub ใช้งานไม่ได้ ระบบจะไม่แก้ไขเวอร์ชัน แต่ยังสามารถ sync Workspace จากรุ่นที่ติดตั้งอยู่ได้

> สำหรับผู้ใช้ **v0.3.0 หรือต่ำกว่า** ต้องดาวน์โหลด v0.7.0 ใหม่หนึ่งครั้ง เพราะ updater รุ่นเก่ายังไม่สามารถดึง Release ใหม่เองได้ หลังจาก v0.4.0 เป็นต้นไปสามารถใช้ไฟล์ Update เพื่ออัปเดตเวอร์ชันถัดไปได้

ไฟล์ส่วนตัวและงานที่สร้างไว้ เช่น `USER.md`, `MEMORY.md`, `output/` และ local edits ที่ระบบติดตาม จะไม่ถูกเขียนทับโดย updater

---

## การจัดเก็บไฟล์ที่ AI สร้าง

ตั้งแต่ **Pilot v0.3** ไฟล์ที่ AI สร้าง เช่น DOCX, PDF, PPTX, XLSX, CSV, HTML และรูปภาพ จะใช้มาตรฐานการจัดเก็บเดียวกัน เพื่อให้หาไฟล์ย้อนหลังง่ายและไม่เขียนทับงานเดิมโดยไม่ตั้งใจ

โครงสร้างหลักคือ:

```text
output/
└─ <TEAM>/
   └─ <YYYY>/
      └─ <MM>/
         └─ <TYPE>/
```

ตัวอย่าง:

```text
output/
├─ CC/
│  └─ 2026/09/presentation/
│     ├─ 20260918_CC_presentation_STeP-Booth-CMU_v01.pptx
│     └─ 20260918_CC_presentation_STeP-Booth-CMU_v02.pptx
├─ GA/
│  └─ 2026/09/document/
│     └─ 20260918_GA_document_หนังสือขอใช้สถานที่_v01.docx
└─ SHARED/
   └─ 2026/09/image/
      └─ 20260918_SHARED_image_Event-Key-Visual_v01.png
```

ชื่อไฟล์ใช้รูปแบบ:

```text
YYYYMMDD_TEAM_TYPE_TITLE_vNN.ext
```

ความหมายของแต่ละส่วน:

- `YYYYMMDD` — วันที่สร้างไฟล์
- `TEAM` — รหัสทีม เช่น `CC`, `MI`, `PITI`, `AFP`; ถ้าไม่มีบริบททีมใช้ `SHARED`
- `TYPE` — ประเภทงาน เช่น `document`, `presentation`, `spreadsheet`, `image`, `data`, `web`
- `TITLE` — ชื่องานที่สั้นและค้นหาเจอได้ ควรเก็บ Project ID / Job ID ไว้ถ้ามี
- `vNN` — เวอร์ชัน เช่น `v01`, `v02`, `v03`

หากชื่อเดียวกันมีอยู่แล้ว ระบบจะเพิ่มเลขเวอร์ชันต่อให้โดยอัตโนมัติแทนการเขียนทับไฟล์เดิม และจะตัดอักขระที่ใช้ไม่ได้บน Windows/macOS ออกจากชื่อไฟล์ โดยยังเก็บข้อความภาษาไทยและคำสำคัญของงานไว้

> ถ้าผู้ใช้ระบุชื่อไฟล์หรือปลายทางไว้เอง ให้ยึดตามที่ผู้ใช้กำหนดก่อน ตราบใดที่ปลอดภัย

โฟลเดอร์ `output/` เป็นพื้นที่เก็บงานเฉพาะ Workspace และถูกตั้งไว้ใน `.gitignore` จึงไม่ถูก commit เข้า repository โดยปริยาย

สำหรับเครื่องมือที่เรียก CLI ได้ สามารถขอชื่อไฟล์และ path ถัดไปก่อนสร้างงาน:

```bash
step-ai output \
  --team cc \
  --type presentation \
  --title "STeP Booth CMU" \
  --ext pptx
```

ตัวอย่างผลลัพธ์:

```text
output/CC/2026/09/presentation/20260918_CC_presentation_STeP-Booth-CMU_v01.pptx
```

สำหรับ automation ใช้ผลลัพธ์แบบ JSON ได้:

```bash
step-ai output \
  --team cc \
  --type presentation \
  --title "STeP Booth CMU" \
  --ext pptx \
  --json
```

กติกากลางอยู่ที่ [`rules/output-management.md`](rules/output-management.md) และรายละเอียดสำหรับพนักงานอยู่ที่ [`docs/employee-guide.md`](docs/employee-guide.md)

---

## Pilot Hardening v0.6

### Lightweight First Run

First Run ใช้ **L0-only startup** เหมือนกันทุก AI adapter: ChatGPT, Claude, Codex, Cursor, OpenCode, Windsurf, Gemini/Antigravity/Spark, Hermes และ Multi/Generic

- อ่านเฉพาะ `START-PROMPT.txt`, `START-HERE.md`, `USER.md` / `MEMORY.md` ถ้ามี
- ไม่ scan `skills/`, `rules/`, `manifest/` และไม่ search `*.md` ทั้ง Workspace
- instruction แสดงเพียงจำนวน Skill/Rule ที่ติดตั้ง ไม่แจกแจง inventory รายไฟล์
- เมื่อมีงานจริงจึงเปิด Router metadata; งานเดี่ยวโหลด 1 primary Skill ส่วนงานหลายขั้นใช้ Playbook และโหลดทีละ Skill ตาม current step

### Browser Login & Credential Safety

Browser Form Assistant รองรับการจำ login แบบ opt-in โดยให้ผู้ใช้ login เองครั้งแรก และ reuse authenticated session หรือ OS/browser credential store เมื่อ runtime รองรับ

- `.env` ใช้เก็บ configuration/credential reference เท่านั้น
- ห้ามเก็บ password/token/cookie/MFA แบบ plaintext
- session/profile ต้องเป็น local และอยู่ใต้พื้นที่ที่ gitignore
- remembered login ไม่ข้าม Human Confirmation Gate ก่อน Submit

### Image Prompt Capability Floor

`step-image-prompt` กำหนด target image model ขั้นต่ำเป็น **GPT-Image-2-class หรือเทียบเท่า** และแนะนำ **GPT-Image-2.5-class หรือสูงกว่า** สำหรับงานที่ต้องเข้าใจ reference, preserve structure/identity และแก้ภาพหลายรอบ

ถ้า model ไม่มี image input/reference understanding ระบบต้องลด workflow เป็น Text-Only Prompt อย่างชัดเจน ไม่ทำเสมือนว่าโมเดลเห็นภาพ

### Pilot 1 เดือน

แผน Pilot ใช้ 4 สัปดาห์ พร้อม Security / Routing / Human Action / Distribution / UX gates และ stop conditions ดู `docs/pilot-operations.md` และ `docs/pilot-readiness-audit.md`

---

## งานหลายขั้น: Playbooks

ตั้งแต่ Pilot v0.7 งานที่ต้องใช้หลายความสามารถต่อกันไม่ถูกบังคับให้เลือก Skill เดียวอีกต่อไป

ตัวอย่าง:

```text
TOR
→ ตรวจ Scope / Deliverables
→ แตกกิจกรรม / WBS
→ จับงบประมาณ
→ ทำ Timeline / Dependency
→ สร้าง Google Sheet หรือ XLSX + Gantt
```

ระบบเรียกแนวทางนี้ว่า **Playbook** โดยยังคงหลักสำคัญว่าโหลดทีละ Skill ไม่โหลดทุกอย่างพร้อมกัน

Playbooks ชุดแรก:
- `tor-to-project-plan`
- `meeting-to-action-plan`
- `iso-audit-readiness-flow`

Playbook อยู่ใน `manifest/playbooks.yaml` และ run state อยู่ใต้ `.step-ai/runs/` เมื่อ client รองรับการเขียนไฟล์

รายละเอียด: [docs/playbooks.md](docs/playbooks.md)

---

## 43 Skills ทำอะไรบ้าง

Skills ไม่ได้ถูกโหลดทั้งหมดพร้อมกัน ระบบจะเลือกเฉพาะส่วนที่เกี่ยวข้องกับงาน

ตัวอย่างกลุ่มงานที่มีอยู่ปัจจุบัน:

### เอกสารและงานบริหาร

- `thai-official-documents` — หนังสือราชการและบันทึกข้อความ
- `meeting-summary` — สรุปประชุม มติ และ Action Items
- `tor-government-writing` — ช่วยร่าง TOR
- `tor-review` — ตรวจความครบถ้วนและความเสี่ยงของ TOR
- `receipt-audit` — ตรวจเอกสารใบเสร็จและหลักฐานเบิกจ่าย
- `browser-form-assistant` — ช่วยเตรียมและตรวจข้อมูลก่อนกรอกแบบฟอร์ม

### โครงการและยุทธศาสตร์

- `project-plan` — WBS, Milestone, Critical Path และ Risk
- `project-pre-mortem` — หาความเสี่ยงก่อนเริ่มโครงการ
- `executive-status-update` — สรุปสถานะสำหรับผู้บริหาร
- `innovation-okr-mapping` — เชื่อมเป้าหมายกับ OKR
- `decision-memo` — เตรียมข้อมูลและตัวเลือกก่อนการตัดสินใจ
- `evidence-before-approval` — ตรวจว่ามีหลักฐานพอก่อนบอกว่างานพร้อม

### Startup และ Innovation

- `startup-discovery` — Customer Discovery, VPC และ The Mom Test
- `assumption-challenger` — หา Critical Assumption ที่ควรพิสูจน์ก่อน
- `industry-problem-discovery` — ถอดโจทย์โรงงานหรือชุมชนก่อนเสนอ Solution
- `market-signal-radar` — ดูสัญญาณตลาดและพฤติกรรมที่เปลี่ยนไป
- `voice-of-customer` — สรุปเสียงลูกค้าและ Pain Point

### Creative และ Communication

- `designer-brief` — เตรียม Creative Brief
- `creative-art-director` — ช่วยกำหนด Creative / Art Direction ก่อนผลิตงาน
- `step-image-prompt` — แปลง Direction เป็น Prompt ภาพที่พร้อมใช้งาน
- `event-concept` — แนวคิด Event, Exhibition และ Booth
- `presentation-design` — โครงสร้างและออกแบบ Presentation
- `step-brand` — บริบทและข้อกำหนดด้านแบรนด์
- `step-writing` — ปรับภาษาให้เหมาะกับการสื่อสารของ STeP

### ISO 9001 / QMS Audit Readiness

- `iso9001-audit-readiness` — เตรียม External/Internal Audit แบบ process-based
- `audit-evidence-matrix` — จัด Evidence Matrix และตรวจ coverage/period/owner
- `document-record-control` — ตรวจ revision, approval, current/obsolete และ records
- `audit-interview-coach` — ซ้อม Auditor Interview จากสิ่งที่ทำจริง
- `ncr-capa` — NC → Root Cause → Corrective Action → Effectiveness
- `qms-risk-opportunity-review` — ทบทวน QMS Risks & Opportunities
- `quality-objective-kpi-review` — ตรวจ Quality Objective/KPI ให้ measurable และ traceable
- `management-review-prep` — เตรียม Management Review Pack จาก evidence ของทั้งองค์กร

ชุดนี้ใช้ได้กับทั้ง 22 ทีม โดย QS เป็นเจ้าของ framework ส่วน evidence เป็นความรับผิดชอบของ Process Owner แต่ละทีม AI ช่วยเตรียมและตรวจ gap ได้ แต่ไม่สามารถรับรองว่า “ผ่าน ISO”, ปิด NC/CAPA หรือให้ conformity decision แทนผู้มีอำนาจได้

### การเรียนรู้ งานแล็บ และระบบ

- `learning-designer` — ออกแบบ Training, Onboarding และ Workshop
- `lab-result-review` — ตรวจความครบถ้วนและ Traceability ของผลทดสอบ
- `data-privacy-compliance` — ตรวจประเด็นข้อมูลส่วนบุคคล
- `sop-authoring` — ช่วยถอดกระบวนการเป็น SOP/WI
- `coding-git-workflow` — แนวทางพัฒนาซอฟต์แวร์
- `github-workflow` — Workflow บน GitHub
- `vercel-deploy` — ตรวจความพร้อมก่อน Deploy

รายการที่เป็น Source of Truth อยู่ที่ [`manifest/skills.yaml`](manifest/skills.yaml)

---

## 22 ทีมของ STeP

ระบบจัดทีมไว้ 5 กลุ่มเพื่อช่วย Router เข้าใจบริบทงาน แต่ไม่ได้ใช้เพื่อปิดกั้นว่า Skill ใดเป็นของใคร

1. Governance, Operations & Quality
2. Incubation, Entrepreneurship & Strategy
3. Tech Transfer & Industry Collaboration
4. Market, Creative & Client
5. Infrastructure, Labs & Pilot Plant

รวมทั้งหมด 22 ทีม

รายละเอียดทีม เจ้าของงาน และเส้นทางที่เกี่ยวข้องดูได้ที่ [`manifest/teams.yaml`](manifest/teams.yaml) และ [docs/teams.md](docs/teams.md)

---

## Router ทำงานอย่างไร

แนวคิดหลักคือ

> **Installed ≠ Loaded**

แม้ Workspace จะมี Skills หลายตัว แต่ AI ไม่จำเป็นต้องอ่านข้อความทุกไฟล์ทุกครั้ง

เมื่อมีคำขอ ระบบจะพิจารณาองค์ประกอบ เช่น

- เจตนาของคำขอ
- คำที่เกี่ยวข้อง
- ทีม
- Path ของไฟล์
- ประเภทไฟล์

จากนั้นเลือก Skill ที่เกี่ยวข้อง แล้วค่อยเปิด Rules, SOP หรือ Reference เพิ่มเมื่อจำเป็น

```text
คำขอของผู้ใช้
      ↓
STeP Router
      ↓
Skill ที่เกี่ยวข้อง
      ↓
Rules / SOP / Reference ที่จำเป็น
      ↓
คำตอบหรือร่างงาน
```

Router ปัจจุบันใช้เวอร์ชัน **2.6.0**

Source of Truth อยู่ที่ [`manifest/router-index.yaml`](manifest/router-index.yaml)

---

## AI ช่วยได้แค่ไหน

Harness ตั้งใจให้ AI เป็น **ผู้ช่วยเตรียมงาน ไม่ใช่ผู้มีอำนาจตัดสินใจ**

AI สามารถช่วย

- ร่าง
- ตรวจ
- สรุป
- เปรียบเทียบ
- จัดโครงสร้างข้อมูล
- หา Missing Information
- เสนอทางเลือก
- เตรียมข้อมูลก่อนตัดสินใจ

แต่บางเรื่องยังต้องให้คนที่มีอำนาจรับผิดชอบตรวจและยืนยัน เช่น

- การอนุมัติงบประมาณ
- การเลือกผู้เสนอราคา
- การลงนามหนังสือ
- การประกาศใช้ SOP
- การเปลี่ยน Brand Identity
- การประเมินบุคลากร
- การออกผลหรือรับรองผลห้องปฏิบัติการ

Authority หลักระบุไว้ใน [`manifest/authority.yaml`](manifest/authority.yaml) และบาง Skill มี `human_only` เพิ่มเติมตามบริบทของงาน เช่น การออกหรือรับรองผลห้องปฏิบัติการ

---

## เรื่องข้อมูลและความเป็นส่วนตัว

อย่าใส่ข้อมูลที่ไม่ควรส่งให้ AI เพียงเพราะมี Harness อยู่ใน Workspace

ก่อนใช้งานควรพิจารณาประเภทข้อมูลและนโยบายของเครื่องมือ AI ที่กำลังใช้เสมอ โดยเฉพาะ

- รหัสผ่านและ Token
- เลขบัตรประชาชน
- ข้อมูลเงินเดือน
- ข้อมูลสุขภาพ
- ข้อมูลส่วนบุคคลที่ไม่จำเป็น
- ความลับทางการค้า
- เอกสารที่มีข้อจำกัดในการเผยแพร่

`USER.md` ใช้เก็บบริบทการทำงานของผู้ใช้ภายใน Workspace และถูกตั้งให้ไม่ commit เข้า Git แต่ไม่ควรใช้เก็บ Password, Token หรือข้อมูลลับ

---

## โครงสร้างของ Repository

```text
STeP-AI-Harness/
├─ skills/          # วิธีทำงานสำหรับแต่ละประเภทงาน
├─ rules/           # กติกากลางที่ต้องใช้ร่วมกัน
├─ manifest/        # Teams, Skills, Processes, Authority และ Router
├─ docs/            # คู่มือและบริบทองค์กร
├─ src/             # CLI, Router และ Adapter
├─ scripts/         # Validation และ Build
├─ test/            # Automated tests
├─ START-HERE.md    # คู่มือเริ่มต้นสำหรับพนักงาน
└─ README.md
```

โครงสร้าง Manifest ขององค์กรใช้ 6 มิติ:

```text
WHO        → Teams / Roles
WHERE      → Organizational context
WHAT       → Skills
WHY        → Services
HOW        → Processes
AUTHORITY  → สิ่งที่ AI ทำได้ และเรื่องที่ต้องให้คนตัดสิน
```

ไม่ได้ตั้งใจสร้าง Workflow Engine ครอบทุกอย่าง งานใหม่ควรเริ่มจาก Skill หรือ Process ที่จำเป็นจริงก่อน

---

## สำหรับ Maintainer

หลังแก้ Skill, Rule หรือ Manifest ควรรันอย่างน้อย:

```bash
python scripts/validate_repo.py
python scripts/build_pilot_bundle.py
npm test
npm pack --dry-run
```

GitHub Actions จะรัน validation และ test อีกครั้งเมื่อเปิด Pull Request หรือมีการเปลี่ยนแปลงบน `main`

หลักที่ใช้ในการเพิ่ม Skill ใหม่:

1. ต้องตอบปัญหางานจริง
2. ต้องไม่ซ้ำกับ Skill ที่มีอยู่
3. ระบุ Owner ให้ชัด
4. ระบุ Human Review / Authority เมื่อเกี่ยวข้อง
5. เขียนให้พนักงานเข้าใจได้ ไม่ใช่เขียนเพื่อ AI อย่างเดียว
6. มีตัวอย่างหรือ Regression Test สำหรับ Router เมื่อมีโอกาสชนกับ Skill อื่น

---

## การปรับปรุงจากการใช้งานจริง

ถ้า AI ตอบไม่ถูก ไม่จำเป็นต้องรู้ Git หรือเปิด Pull Request

พนักงานสามารถบอกในแชทได้ตรง ๆ เช่น

> เมื่อกี้ตอบไม่ถูก ช่วยแจ้งทีม STeP AI ให้หน่อย

หรือ

> อยากให้ STeP AI ช่วยงานแบบนี้เพิ่ม

จุดสำคัญคือส่ง **ตัวอย่างงานจริงที่ถูกต้อง** มาด้วย เพราะตัวอย่างจากผู้ทำงานจริงมีประโยชน์ต่อการปรับ Skill มากกว่าการเพิ่ม Prompt ที่ยาวขึ้น

รายละเอียดดูที่ [docs/employee-guide.md](docs/employee-guide.md)

---

## สถานะโครงการ

STeP AI Harness ยังเป็น **Pilot**

โครงสร้าง Skills, Router และ Workflow จะเปลี่ยนตามผลทดลองใช้งานของพนักงาน สิ่งที่อยู่ใน repository จึงไม่ควรถูกมองว่าเป็นระเบียบหรือนโยบายฉบับใหม่ขององค์กรโดยอัตโนมัติ

เป้าหมายช่วงนี้คือทำให้ระบบ

- ใช้งานง่ายกับคนที่ไม่ได้ทำงานด้าน AI
- ช่วยงานจริงได้
- ไม่เพิ่มขั้นตอนโดยไม่จำเป็น
- รู้ว่าเมื่อไรควรหยุดและให้คนตัดสิน
- ปรับปรุงได้จาก feedback ของทั้ง 22 ทีม

ถ้าเริ่มใช้งานครั้งแรก ให้เริ่มจาก [START-HERE.md](START-HERE.md)
