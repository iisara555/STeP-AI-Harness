# STeP AI Harness

**Organization-specific AI Harness สำหรับอุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP / RSP North)**

STeP AI Harness เป็นชั้นกลางระหว่าง **พนักงาน STeP** กับ **AI ที่แต่ละคนเลือกใช้** เพื่อให้ AI เข้าใจบริบทองค์กร เลือก Skill/Playbook ที่เหมาะสม ใช้แหล่งอ้างอิงที่ตรวจสอบย้อนกลับได้ และรู้ว่าเมื่อใดต้องหยุดให้มนุษย์ตัดสิน

> เป้าหมายไม่ใช่สร้าง AI ตัวเดียวให้ทำทุกอย่าง แต่ทำให้ AI หลายระบบช่วยงาน STeP ได้อย่าง **มีบริบท สม่ำเสมอ ตรวจสอบได้ ปลอดภัย และไม่ข้ามอำนาจของคน**

## สถานะปัจจุบัน

| รายการ | สถานะ |
| --- | --- |
| Released Pilot | **v0.7.2** |
| Development branch | **feat/context-efficiency** |
| Teams | **22 ทีม** |
| AI routing clusters | **5 clusters** |
| Skills | **43 Skills** |
| Playbooks | **3 Playbooks** |
| Executable Actions | **3 Actions** |
| Provenance labels | **6 types** |
| Quality Layer | **v0.1 — Pilot Foundation** |
| AFP Finance & Procurement | **Demo Source Pack / Foundation Preparation** |
| Privacy Gate | **Lightweight local-first Pilot** |
| Context Efficiency | **Local routing + token telemetry + structured handoff** |

> Released Pilot ยังคงเป็น v0.7.2 ส่วน development branch นี้เพิ่ม Context Efficiency บน Foundation เดิม และยังไม่ควรถูกตีความว่าเป็น Release ใหม่จนกว่าจะ merge/release อย่างเป็นทางการ

[เริ่มใช้งานสำหรับพนักงาน](START-HERE.md) · [คู่มือพนักงาน](docs/employee-guide.md) · [Architecture Reference](docs/architecture.md) · [ดูรายชื่อทีม](docs/teams.md)

---

## ทำไมต้องมี STeP AI Harness

พนักงานสามารถใช้ ChatGPT, Claude, Codex, Cursor หรือ AI อื่นช่วยงานได้อยู่แล้ว แต่ AI ทั่วไปมักไม่รู้ว่า:

- STeP มีทีมและเจ้าของกระบวนการใดบ้าง
- เอกสารไหนเป็นกฎ เอกสารไหนเป็นตัวอย่าง หรือเอกสารไหนยังไม่ได้ยืนยัน revision
- งานแบบใดใช้ Skill เดียว และงานแบบใดต้องใช้หลาย Skill ต่อกัน
- ข้อมูลส่วนบุคคลส่วนไหนควรถูกปิดบังก่อนส่งไปประมวลผล
- เรื่องใด AI ช่วยวิเคราะห์ได้ แต่ไม่มีอำนาจอนุมัติแทนคน
- เมื่อสร้างไฟล์หรือส่งข้อมูลออกไปจริง ต้องผ่าน confirmation หรือ action gate แบบใด

Harness จึงทำหน้าที่เป็น **Organization Context + Governance + Execution Contract** ที่อยู่ระหว่างคนกับ AI

---

# Architecture

## ภาพรวม Layer

~~~mermaid
flowchart TB

    U[พนักงาน STeP<br/>พิมพ์งานเป็นภาษาธรรมชาติ]

    subgraph L1["1 — AI Client & Workspace"]
      AI[ChatGPT / Claude / Codex / Cursor<br/>OpenCode / Windsurf / Gemini / Hermes]
      AD[Adapter + Lightweight First Run<br/>โหลดเฉพาะบริบทที่จำเป็น]
    end

    subgraph L2["2 — Intent & Routing"]
      RT[Router<br/>Intent + Team + File + Path + Signals]
      S1[Atomic Task → Skill]
      P1[Composite Task → Playbook]
    end

    subgraph L3["3 — Organization Model 6D"]
      WHO[WHO<br/>Teams / Roles / Owners]
      WHERE[WHERE<br/>Organization Context]
      WHAT[WHAT<br/>Skills / Capabilities]
      WHY[WHY<br/>Services / Policies / Objectives]
      HOW[HOW<br/>Processes / Playbooks]
      AUTH[AUTHORITY<br/>Human Decision Boundaries]
    end

    subgraph L4["4 — Controlled Knowledge & Domain Governance"]
      DOC[Document Registry<br/>Rules / Policies / Templates / Sources]
      QL[Quality Layer v0.1<br/>ISO / Policy / QP / WI / Records]
      AFP[AFP Demo Source Pack<br/>Finance / Procurement Sources<br/>รอ AFP ยืนยัน source ภายใน]
    end

    subgraph SAFE["Cross-cutting Safeguards"]
      PRIV[Privacy Gate<br/>Quick Scan → Auto-mask → High-risk Gate]
      PROV[Source & Provenance<br/>Facts / Rules / Assumptions / Recommendations]
      HUM[Human Authority<br/>Approval / Budget / Legal / Signing / QMS]
      SEC[Secret & Credential Safety]
    end

    subgraph L5["5 — Skills & Playbooks"]
      SK[43 Skills]
      PB[3 Playbooks]
    end

    subgraph L6["6 — Action & Tool Execution"]
      AG[Capability / Risk / Confirmation Gate]
      ACT[Action Registry<br/>3 Actions]
      TOOL[Tools / Connectors / Local Runtime<br/>Sheets / XLSX / Browser / Files / APIs / MCP]
    end

    subgraph L7["7 — State, Output & Learning"]
      RUN[Run State v3<br/>safe metadata / provenance / events]
      OUT[Output Management<br/>versioned files]
      FB[Feedback<br/>useful / needs-fix / not-useful]
    end

    U --> AI --> AD --> RT
    RT --> WHO
    RT --> WHERE
    RT --> WHAT
    RT --> WHY
    RT --> HOW
    RT --> AUTH

    WHY --> DOC
    DOC --> QL
    DOC --> AFP

    RT --> S1 --> SK
    RT --> P1 --> PB

    PRIV -.ก่อนประมวลผลข้อมูล.-> RT
    PROV -.กำกับข้อเท็จจริงและ source.-> SK
    PROV -.กำกับข้อเท็จจริงและ source.-> PB
    HUM -.บังคับขอบเขตอำนาจ.-> SK
    HUM -.บังคับขอบเขตอำนาจ.-> PB
    SEC -.ครอบคลุม client/tool.-> AI
    SEC -.ครอบคลุม client/tool.-> TOOL

    SK --> AG
    PB --> AG
    AG --> ACT --> TOOL
    SK --> RUN
    PB --> RUN
    TOOL --> RUN
    RUN --> OUT
    RUN --> FB
    FB -.ปรับ Router / Skill / Source Mapping.-> RT
~~~

รายละเอียดเต็มและคำอธิบายแต่ละ Layer: [docs/architecture.md](docs/architecture.md)

### หลักที่ต้องแยกให้ชัด

~~~text
Organization Model 6D
≠ Quality Layer
≠ AFP Source Pack
≠ Privacy Gate
≠ Skill
≠ Playbook
≠ Action
≠ Tool
~~~

- **6D** คือโมเดลขององค์กร
- **Quality / AFP** คือ domain knowledge และ governance sources
- **Privacy / Provenance / Human Authority** เป็น cross-cutting safeguards
- **Skill** คือความสามารถเฉพาะงาน
- **Playbook** คือการเรียงหลาย Skill สำหรับงาน composite
- **Action** คือการลงมือทำกับระบบจริง
- **Tool** คือเครื่องมือที่ Action ใช้

---

## Organization Model 6D

Harness ใช้โมเดลองค์กร 6 มิติ:

| Dimension | ใช้ตอบคำถาม |
| --- | --- |
| **WHO** | ใครเป็นเจ้าของ ผู้รับผิดชอบ Reviewer หรือ Approver |
| **WHERE** | งานนี้อยู่ในทีม/หน่วยงาน/บริบทใด |
| **WHAT** | ต้องใช้ Skill หรือ capability อะไร |
| **WHY** | งานนี้เชื่อมกับบริการ นโยบาย เป้าหมาย หรือเหตุผลใด |
| **HOW** | กระบวนการหรือ Playbook เป็นอย่างไร |
| **AUTHORITY** | ใครมีอำนาจตัดสินขั้นสุดท้าย |

6D ไม่ควรถูกขยายเป็น Dimension 7/8/9 เพียงเพราะเพิ่ม Privacy, Quality หรือ Tool ใหม่ เพราะสิ่งเหล่านั้นเป็นคนละประเภทของ architecture concern

---

# การทำงานของ Harness

~~~text
พนักงานพิมพ์งาน
      ↓
Lightweight First Run
      ↓
Privacy Quick Check เมื่อมีข้อมูล/เอกสาร
      ↓
Router
      ↓
Team + Intent + 6D Context
      ↓
Atomic Task?
 ├─ ใช่ → Skill
 └─ ไม่ใช่ → Playbook → Skill ทีละขั้น
      ↓
Source / Provenance
      ↓
Human Authority Check
      ↓
ต้องลงมือทำกับระบบจริง?
 ├─ ไม่ → ตอบ/ร่าง/วิเคราะห์
 └─ ใช่ → Action Registry → Tool
      ↓
Output + Run State + Feedback
~~~

## Lightweight First Run

First Run ใช้หลัก **L0-only startup**:

- อ่านเฉพาะไฟล์เริ่มต้นและข้อมูลผู้ใช้ที่จำเป็น
- ไม่ scan Skills/Rules/Manifest ทั้ง repo ตอนเปิดครั้งแรก
- งานจริงค่อยเปิด Router metadata
- Atomic task โหลด primary Skill เท่าที่จำเป็น
- Composite task โหลด Skill ทีละ step ผ่าน Playbook

เป้าหมายคือให้พนักงานเริ่มงานเร็วและลด context pollution

---

# Skills, Playbooks และ Actions

## Skills

ปัจจุบันมี **43 Skills** ครอบคลุมงานเอกสาร การบริหาร โครงการ การเงิน/พัสดุ Startup/Innovation การตลาด งานสร้างสรรค์ ห้องปฏิบัติการ และระบบคุณภาพ

ตัวอย่าง:

- tor-review
- tor-government-writing
- receipt-audit
- meeting-summary
- project-plan
- browser-form-assistant
- iso9001-audit-readiness
- audit-evidence-matrix
- document-record-control
- ncr-capa
- management-review-prep
- creative-art-director

## Playbooks

Playbook ใช้เฉพาะงานที่ต้องใช้หลาย Skill ต่อกัน ไม่ใช่ workflow engine กลาง

ปัจจุบันมี 3 ตัว:

| Playbook | Flow |
| --- | --- |
| tor-to-project-plan | TOR → Review → WBS/Plan → Google Sheet/XLSX + Gantt |
| meeting-to-action-plan | Meeting → Actions → Plan/Timeline → Sheet |
| iso-audit-readiness-flow | ISO readiness → Evidence / Documents / Interview / KPI / CAPA / Management Review ตามคำขอ |

### ตัวอย่าง TOR → Project Plan

~~~text
TOR 1 ฉบับ
   ↓
tor-review
   ↓
แยก TOR Facts / Planning Assumptions
   ↓
project-plan
   ↓
WBS / Milestone / Dependency / Timeline
   ↓
spreadsheet-project-plan
   ↓
Google Sheets หรือ XLSX
~~~

กติกาสำคัญ:
- หนึ่ง TOR ต่อหนึ่ง Run
- ใช้วันที่จาก source ก่อน
- งบใช้จาก source เท่านั้น
- ไม่กระจายวงเงินรวมเป็นรายกิจกรรมเอง
- ถ้าสร้างไฟล์ไม่ได้ ให้สถานะ waiting-tool
- ห้าม claim ว่าสร้างไฟล์แล้วถ้ายังไม่มี output reference จริง

## Action Registry

Action แยกออกจาก Skill อย่างชัดเจน ปัจจุบันมี 3 Actions:

| Action | Capability | Risk / Confirmation |
| --- | --- | --- |
| spreadsheet-project-plan | spreadsheet-write | low / none |
| spreadsheet-action-plan | spreadsheet-write | low / none |
| browser-form-submit | browser-submit | high / user-confirm |

Action Registry ทำให้ Harness ตรวจได้ว่า Tool ที่ต้องใช้มีจริงหรือไม่ มี side effect หรือไม่ และต้องรอคนยืนยันก่อนหรือไม่

---

# Source & Provenance

Harness ใช้ provenance 6 ประเภท:

| Type | ความหมาย |
| --- | --- |
| SOURCE_FACT | อ่านตรงจาก source |
| DERIVED_FACT | คำนวณ/อนุมานจาก source ที่ระบุได้ |
| USER_INPUT | ผู้ใช้บอกโดยตรง |
| PLANNING_ASSUMPTION | สมมติฐานเพื่อวางแผน |
| ORGANIZATION_RULE | กฎหรือ Authority จาก controlled source |
| AI_RECOMMENDATION | ข้อเสนอของ AI |

หลักสำคัญ:

~~~text
Fact
≠ Assumption
≠ Organization Rule
≠ AI Recommendation
~~~

ระบบไม่ควรนำ Planning Assumption หรือ AI Recommendation ไปเสนอเป็นข้อเท็จจริงหรือกฎขององค์กร

---

# Human Authority

AI ช่วย **ร่าง ตรวจ เปรียบเทียบ สรุป เตรียมหลักฐาน และเสนอทางเลือก** ได้ แต่ไม่รับอำนาจต่อไปนี้แทนมนุษย์:

| Authority | ตัวอย่าง |
| --- | --- |
| procurement-approval | เลือก/ตัดสินผู้ชนะ |
| budget-allocation | อนุมัติงบ/สั่งจ่าย/เปลี่ยนวงเงิน |
| legal-advice | ความเห็นทางกฎหมายที่มีผลผูกพัน |
| official-signing | ลงนามเอกสารอย่างเป็นทางการ |
| iso-enactment | ประกาศใช้/แก้ไข/ยกเลิก controlled document |
| qms-conformity-decision | รับรอง QMS / ปิด NC-CAPA อย่างเป็นทางการ |
| policy-waiver | อนุมัติผ่อนผัน/exception |
| hr-performance-evaluation | ประเมินผลบุคลากร |
| brand-alteration | อนุมัติเปลี่ยน Brand Identity |

Human Authority ยังมีผลแม้ AI จะจำ login หรือมี Tool ที่สามารถกด Submit ได้

---

# Lightweight Privacy Gate

Privacy Gate ใช้หลัก **local-first + fast path** เพื่อไม่ทำให้ทุกงานช้า:

~~~text
Input
  ↓
Quick Local Scan
  ├─ Public/Internal → ผ่านหรือปิดบังเท่าที่จำเป็น
  ├─ Restricted → Auto-mask
  └─ Sensitive / High Risk → Human Confirmation หรือ Block external AI
~~~

สิ่งที่ระบบทำใน Pilot:
- ตรวจรูปแบบที่ชัดเจนด้วย local regex/heuristic ก่อน model
- ปิดบังเบอร์โทร อีเมล เลขประจำตัว เลขบัญชี และที่อยู่ที่ไม่จำเป็น
- รองรับ allowlist identifier ขององค์กรที่เป็นข้อมูลสาธารณะและจำเป็นต่อ Task
- cache ผล scan ตาม hash
- ไม่ OCR PDF/รูปภาพทั้งชุดอัตโนมัติ
- Run State เก็บเฉพาะ privacy-safe metadata
- query/feedback ที่ persist ต้องผ่าน redaction ก่อน
- ไม่เก็บ raw PII, password, token, cookie หรือ MFA ใน log

ตรวจไฟล์ข้อความแบบ local:

~~~bash
step-ai privacy --file sample.txt
step-ai privacy --file sample.txt --redact
~~~

กติกาหลักอยู่ที่ [rules/data-classification.md](rules/data-classification.md)

---

# Context Efficiency & Token Budgeting

Context Efficiency เป็น **implementation mechanism ภายใน Router / Context Assembly** ไม่ใช่ Layer หรือ Dimension ใหม่

~~~text
User
 ↓
Local Deterministic Router
 ↓
Compact Routing Contract
 ↓
Context Budget
 ├─ Selected Skill only
 ├─ Mandatory Rules only
 ├─ Relevant Sources only
 └─ Governance metadata only
 ↓
AI
~~~

หลักที่เพิ่ม:
- ห้ามส่ง `router-index.yaml` ทั้งไฟล์เข้า model context เมื่อ local router ใช้งานได้
- ใช้ `step-ai ask "<งาน>" --json` เพื่อรับ compact routing contract
- มี token telemetry แยก **estimated** ออกจาก provider-reported actual usage
- มี default context budget ต่อ component
- Playbook สร้าง structured handoff และส่งเฉพาะ context ที่ step ถัดไปต้องใช้
- Full output ยังอยู่ใน Run State เพื่อ traceability/resume แต่ไม่ต้อง replay เข้า model ทุก step

อ่านเพิ่ม: [docs/context-efficiency.md](docs/context-efficiency.md)

---

# Quality Layer v0.1

Quality Layer เป็น **Controlled Source/Governance Layer** ที่เชื่อมกับ Skills เดิม ไม่ใช่ Dimension ใหม่

~~~text
ISO 9001:2015
      ↓
STeP Quality Policy V2
      ↓
Quality Manual              ← MISSING
      ↓
Quality Procedures
      ↓
WI / SD / FM
      ↓
Quality Records / Evidence

Master Document List        ← MISSING
      └─ ใช้ยืนยัน Current / Superseded / Obsolete
~~~

สถานะปัจจุบัน:
- ISO 9001:2015 ลงทะเบียนเป็น external standard
- STeP Quality Policy Version 2 ลงทะเบียนแล้ว
- QP ที่ได้รับถูก mark เป็น provided-unverified จนกว่า Master Document List จะยืนยัน
- Quality Manual และ Master Document List เป็น known gaps
- Existing QMS Skills map กับ source ที่เกี่ยวข้องแล้ว
- มี Staff Pilot Smoke Test 15 เคส

อ่านเพิ่ม: [docs/quality-layer.md](docs/quality-layer.md) · [Quality Pilot Smoke Test](docs/quality-pilot-smoke-test.md)

---

# AFP Finance & Procurement Foundation

AFP ยังอยู่ในสถานะ **Demo Source Pack / Foundation Preparation** เพื่อใช้ประชุมและเก็บ Source of Truth ที่ AFP ใช้จริง

Demo ใช้แหล่งอ้างอิงภาษาไทยเป็นหลักจาก:
- STeP procurement/OIT references
- แหล่งส่วนกลางของมหาวิทยาลัยเชียงใหม่
- กฎหมาย/ระเบียบระดับประเทศและกระทรวง
- Source ภายใน AFP จะถูกเพิ่มเมื่อหัวหน้า AFP ยืนยัน

## 4 Demo Use Cases

| Demo | เป้าหมาย |
| --- | --- |
| ตรวจใบเสร็จและเอกสารการเงิน | Pre-check ก่อนส่ง AFP |
| ตรวจ TOR | แยก Rule / Risk / Judgment |
| ต้องเตรียมเอกสารอะไรบ้าง | Document requirement navigator |
| ครั้งก่อนผ่าน ทำไมครั้งนี้ไม่ผ่าน | Explain My Return / Conflict Resolver |

หลักสำคัญ:
- เคสเก่าเป็น historical reference ไม่ใช่ rule
- Rule / Evidence / Judgment ต้องแยกกัน
- AI ไม่อนุมัติการเบิก
- AI ไม่เลือกผู้ชนะ
- AI ไม่ override คำตัดสินเดิมของ AFP
- Source ที่ AFP ยังไม่ยืนยันต้องแสดงว่า **รอ AFP ยืนยัน**

เริ่ม Demo: [docs/afp-demo-start.md](docs/afp-demo-start.md)

เอกสารประกอบ:
[Source Register](docs/afp-demo-source-register.md) · [Demo Concepts](docs/afp-demo-concepts.md) · [Run Sheet](docs/afp-demo-run-sheet.md)

---

# Run State, Output และ Feedback

## Run State v3

งาน Playbook ที่ต้อง resume เก็บ state ที่:

~~~text
.step-ai/runs/<run-id>/state.json
~~~

เก็บได้:
- current/completed step
- provenance metadata
- privacy-safe metadata
- output references
- events
- feedback

ไม่ควรเก็บ:
- raw PII ที่ไม่จำเป็น
- password/token/cookie/MFA
- secret
- สำเนาเอกสารทั้งฉบับโดยไม่จำเป็น

Run State มีไว้ resume งาน ไม่ใช่ central workflow engine

## Output Management

ไฟล์ที่ AI สร้างใช้โครงสร้าง:

~~~text
output/
└─ <TEAM>/
   └─ <YYYY>/
      └─ <MM>/
         └─ <TYPE>/
            └─ YYYYMMDD_TEAM_TYPE_TITLE_vNN.ext
~~~

output/ และ .step-ai/ ถูก gitignore โดยปริยาย

ตัวอย่าง:

~~~bash
step-ai output --team cc --type presentation --title "STeP Booth CMU" --ext pptx
~~~

## Feedback

Pilot ใช้ feedback ง่าย ๆ:
- useful
- needs-fix
- not-useful

เป้าหมายคือดูว่า failure มาจาก **Router / Skill / Source / Tool / Authority** แล้วแก้เฉพาะจุดที่ usage จริงแสดงว่าจำเป็น

---

# เริ่มใช้งานสำหรับพนักงาน

Released Pilot ปัจจุบันคือ **v0.7.2**

1. ดาวน์โหลด STeP-AI-Pilot-v0.7.2.zip จาก GitHub Releases หรือ Shared Drive
2. แตกไฟล์
3. Windows เปิดตัวติดตั้ง .bat / macOS เปิด Install-STeP-AI.command
4. เปิดโฟลเดอร์ STeP AI ด้วย AI client ที่ใช้อยู่
5. พิมพ์งานเป็นภาษาไทยตามปกติ

ตัวอย่าง:

> ช่วยตรวจ TOR นี้ก่อนส่ง AFP

> ช่วยตรวจใบเสร็จชุดนี้ก่อนส่งการเงิน

> สรุปประชุมเมื่อเช้า แยกสิ่งที่ต้องทำต่อ

> เอา TOR นี้มาแตกกิจกรรม ระยะเวลา แล้วทำ Gantt ลง Google Sheet

ไม่ต้องจำชื่อ Skill หรือ Playbook

รายละเอียด: [START-HERE.md](START-HERE.md)

---

# AI Clients ที่รองรับ

Harness ออกแบบให้ model/tool-independent และมี adapter/workspace pattern สำหรับ:

- ChatGPT
- Claude
- Codex
- Cursor
- OpenCode
- Windsurf
- Gemini
- Hermes
- Multi / Generic

หลักคือ **ความรู้และกติกาของ STeP อยู่กับ Workspace/Harness มากกว่าผูกกับ AI provider รายเดียว**

---

# Browser & Credential Safety

Browser Assistant ใช้หลัก:
- ผู้ใช้ login เอง รวม MFA/CAPTCHA/passkey
- remembered login เป็น opt-in
- password/token/cookie/MFA ห้ามเก็บ plaintext ใน .env หรือ repo
- local browser profile/session ต้องอยู่ในพื้นที่ gitignore
- remembered login ไม่ข้าม Human Confirmation ก่อน Submit

ดู [rules/browser-credential-safety.md](rules/browser-credential-safety.md)

---

# Repository Structure

~~~text
STeP-AI-Harness/
├─ START-HERE.md
├─ README.md
├─ skills/                 # Atomic Skills
├─ rules/                  # Shared rules / safeguards
├─ manifest/
│  ├─ teams.yaml           # 22 teams / 5 routing clusters
│  ├─ skills.yaml          # Skill governance
│  ├─ router-index.yaml    # Intent routing
│  ├─ processes.yaml       # HOW
│  ├─ services.yaml        # WHY
│  ├─ authority.yaml       # AUTHORITY
│  ├─ organization.yaml    # Organization context
│  ├─ documents.yaml       # Controlled source registry
│  ├─ playbooks.yaml       # Composite flows
│  ├─ actions.yaml         # Executable actions
│  └─ provenance.yaml      # Provenance contract
├─ src/
│  ├─ cli/
│  └─ modules/
│     ├─ router/
│     ├─ playbooks/
│     ├─ provenance/
│     ├─ actions/
│     └─ privacy/
├─ docs/
│  ├─ architecture.md
│  ├─ harness-foundation.md
│  ├─ quality-layer.md
│  ├─ quality-pilot-smoke-test.md
│  ├─ afp-demo-start.md
│  ├─ afp-demo-source-register.md
│  ├─ afp-demo-concepts.md
│  └─ afp-demo-run-sheet.md
├─ test/
├─ install/
└─ scripts/
~~~

---

# Validation & Tests

ก่อน merge/release ให้รัน:

~~~bash
python scripts/validate_repo.py
python scripts/build_pilot_bundle.py
npm test
npm pack --dry-run
~~~

Test suite ครอบคลุมอย่างน้อย:
- Router และ employee natural-language queries
- installer/update
- First Run
- Playbooks
- Action Registry
- Provenance
- Human Authority
- Quality Layer
- AFP Demo routing
- Privacy Gate
- package/bundle integrity

---

# Known Gaps

## Quality

ยังขาด:
- Current Quality Manual
- Current Master Document List

ดังนั้น Harness ยังไม่ควร claim current revision ของ QP/WI จากไฟล์เพียงอย่างเดียว

## AFP

ยังต้องให้ AFP ยืนยัน:
- Source of Truth ภายใน
- TOR Checklist
- Receipt/Finance Checklist
- transaction → required documents
- top return reasons
- rule vs judgment boundary
- authority/escalation ที่ใช้จริง
- superseded documents

## Privacy

Privacy Gate ปัจจุบันเป็น lightweight Pilot:
- fast local text scanning
- auto-mask
- safe logging

ยังไม่ได้พยายามทำ OCR/privacy classification เต็มรูปแบบกับเอกสารทุกชนิดโดยอัตโนมัติ

---

# สิ่งที่ยังตั้งใจไม่ทำใน Pilot

เพื่อไม่ให้ระบบ overengineered ก่อนมี usage จริง ยังไม่สร้าง:

- Organization-wide Vector DB
- Full Knowledge Graph
- Multi-agent orchestration ขนาดใหญ่
- Drag-and-drop Workflow Designer
- Central Control-plane Dashboard
- Autonomous cross-system agents
- Complex RBAC platform

แนวทางคือ:

~~~text
Pilot
  ↓
Usage จริง
  ↓
หา failure / friction
  ↓
แก้ Router / Skill / Source / Tool / Authority
  ↓
ค่อยเพิ่ม architecture เฉพาะเมื่อจำเป็น
~~~

---

## Design Principle

> **Organization knowledge should outlive any single AI model.**

Model เปลี่ยนได้ Tool เปลี่ยนได้ แต่บริบทองค์กร Source of Truth กติกา กระบวนการ และขอบเขตอำนาจควรเป็นทรัพย์สินของ STeP เอง
