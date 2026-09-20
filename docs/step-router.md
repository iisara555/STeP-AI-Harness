# STeP AI — Organization Knowledge Architecture & Router Specification

เอกสารข้อกำหนดทางเทคนิคและการออกแบบสถาปัตยกรรม **STeP Organization Knowledge Architecture** และ **3-Layer Skill Router** สำหรับองค์กร **STeP / RSP North**

---

## ทำไมต้องมี Router และ Organization Registry?

ในการทำงานระดับองค์กรที่มีมากกว่า 20–300 Skills หาก Agent โหลดไฟล์ `SKILL.md`, SOP, คู่มือ ISO และเอกสารอ้างอิงทั้งหมดเข้ามาใน Context Window พร้อมกันตั้งแต่เริ่มต้น:
1. **Context Window เต็มเร็วเกินไป**: สูญเสีย Token มหาศาลไปกับความรู้ที่ไม่ได้ใช้ในงานนั้น
2. **Context Pollution**: กฎและข้อบังคับของแผนกอื่น (เช่น กฎจัดซื้อจัดจ้าง) อาจปนเปื้อนเข้าไปในงานสร้างสรรค์ (เช่น การเขียนแคปชัน Artwork)
3. **Hallucination สูงขึ้น**: ยิ่งข้อมูลเริ่มต้นมาก โมเดลยิ่งมีโอกาสสับสนและตอบผิดพลาด
4. **ขาดบริบทองค์กร (Lack of Organizational Context)**: การรู้จักแค่ Role และ Skill ไม่สามารถตอบคำถามสำคัญได้ว่า *"งานนี้เป็น Process อะไร, ใครเป็น Process Owner, เป็นบริการด้านใด, และใครเป็นผู้อนุมัติได้จริง"*

---

## สถาปัตยกรรมองค์กร 6 มิติ (6-Dimension Organization Model)

ระบบ STeP AI Harness แยกมิติความรู้องค์กรออกเป็น 6 แกนอิสระ:

```text
┌─────────────────┬──────────────────────────────────┬─────────────────────────────────┐
│ มิติ (Dimension) │ ความหมาย                         │ แหล่งข้อมูล (Source of Truth)     │
├─────────────────┼──────────────────────────────────┼─────────────────────────────────┤
│ 1. WHO          │ บทบาทของ AI Agent                │ manifest/roles.yaml             │
│ 2. WHERE        │ หน่วยงานและทีม (22 ทีม 5 กลุ่ม)   │ manifest/teams.yaml             │
│ 3. WHAT         │ ทักษะและมาตรฐานงาน (Skills)      │ manifest/skills.yaml            │
│ 4. WHY          │ บริการและภารกิจของอุทยานฯ        │ manifest/services.yaml          │
│ 5. HOW          │ กระบวนการทำงานและ SOP            │ manifest/processes.yaml         │
│ 6. AUTHORITY    │ อำนาจตัดสินใจ / การอนุมัติ       │ manifest/authority.yaml         │
└─────────────────┴──────────────────────────────────┴─────────────────────────────────┘
```

- **แยก Registry ออกจาก Router Index**: `router-index.yaml` ทำหน้าที่เป็น Routing Table ขนาดเบาเพื่อความรวดเร็วในการจับคู่ ส่วนข้อมูลรายละเอียดองค์กร (Process, SOP, Services, Authorities) ถูกกระจายอยู่ใน Registries เฉพาะทาง
- **5 Clusters เป็น AI Search-Space Reduction Taxonomy**: การจัด 22 ทีมเป็น 5 กลุ่มงานมีไว้เพื่อลด Search Space ของ AI จาก 150+ ทักษะเหลือ ~20 ทักษะต่อกลุ่ม โดยไม่กระทบสายการบังคับบัญชาจริงขององค์กร
- **รองรับ Multi-Team Consumption**: สนับสนุนการทำงานร่วมกันข้ามฝ่าย (เช่น ทีม `piti` บ่มเพาะสตาร์ทอัพ เรียกใช้กระบวนการ `procurement.tor` ของ `afp` ได้อย่างไร้รอยต่อ)

---

## กฎทองคำ: Installed ≠ Loaded

การรัน `step-ai init --team qs` ไม่ได้หมายถึงการโหลด Skill ทั้งหมดของทีม QS เข้า Prompt!
- **Installed**: ติดตั้งดัชนี Index และสร้างสภาพแวดล้อมให้ค้นพบได้ (Discovery Index)
- **Loaded**: จะโหลดเข้าหน่วยความจำจริงเพียง **1 Primary Skill** ในเวลาที่คำขอตรงกับงานเท่านั้น

---

## 4-Level Progressive Disclosure (Loading Budget)

```text
Level 0: Registry / Metadata (router-index.yaml ~KB)
             ↓
Level 1: Active Skill / Current Playbook Step (ทีละ 1 SKILL.md)
             ↓
Level 2: Mandatory Rules & SOPs (rules/*.md เมื่อคำขอเรียกหาเงื่อนไข)
             ↓
Level 3: Templates & Examples (เฉพาะเมื่อต้องเทียบผลลัพธ์)
```

1. **Level 0 (Metadata)**: สแกนโฟลเดอร์ นามสกุลไฟล์ และ User Intent เพื่อคำนวณคะแนน
2. **Level 1 (Skill / Playbook Step)**: งาน Atomic โหลด `SKILL.md` ตัวเดียว; งาน Composite ใช้ `manifest/playbooks.yaml` และโหลดทีละ Skill ตาม current step
3. **Level 2 (Mandatory Rules & SOPs)**: เปิดอ่านกติกาใน `rules/` หรือ SOP เฉพาะเมื่อคำขอถามถึงระเบียบ ความลับ หรือความปลอดภัย
4. **Level 3 (Templates & Examples)**: 0 ไฟล์เป็นค่าเริ่มต้น ห้ามเปิดตัวอย่างเอกสารหรือคู่มือฉบับเต็มโดยไม่จำเป็น เปิดเฉพาะเมื่อผู้ใช้สั่งให้จัดรูปแบบเทียบเคียง

---

## Deterministic 5-Factor Scoring Engine

คะแนนความมั่นใจคำนวณทางคณิตศาสตร์จาก 5 ปัจจัย (คะแนนรวม 0.00 – 1.00):

$$\text{Score} = (\text{Intent} \times 0.30) + (\text{Keyword} \times 0.25) + (\text{Path} \times 0.20) + (\text{Team} \times 0.15) + (\text{FileType} \times 0.10)$$

*(ค่าน้ำหนักและเกณฑ์คะแนนสามารถปรับแต่งได้ใน `manifest/router-index.yaml` บล็อก `routing.scoring`)*

| ปัจจัย | น้ำหนักเริ่มต้น | เกณฑ์การตรวจพบ |
|---|---|---|
| **Intent Match** | **30%** | คำกริยาในคำขอตรงกับเจตนาของ Skill (review, create, summarize, plan, deploy, triage) |
| **Keyword Match** | **25%** | พบคำสำคัญหรือคำเฉพาะทาง (Triggers) ในข้อความคำสั่ง |
| **Path Match** | **20%** | อยู่ในโฟลเดอร์งานที่ระบุใน paths (เช่น `**/TOR/**`, `**/artwork/**`, `**/QS/**`) |
| **Team Context** | **15%** | ตรงกับทีมเจ้าของ (Primary: 15%) หรือทีมร่วมใช้งาน (Consumer: 10.5%) |
| **File Type Match** | **10%** | มีไฟล์นามสกุลที่เกี่ยวข้องอยู่ในโฟลเดอร์ (เช่น `.docx`, `.xlsx`, `.ai`, `.pdf`) |

---

## กระบวนการคลายความกำกวมด้วย Cheap Context (Disambiguation Protocol)

เมื่อระบบคำนวณคะแนนแล้วตกอยู่ในช่วง **AMBIGUOUS Tier (0.50 – 0.79)**:

```text
AMBIGUOUS (0.50 - 0.79)
         │
         ▼
Inspect Cheap Context (ต้นทุนต่ำ)
  - ชื่อไฟล์ที่เปิดอยู่
  - Frontmatter 5-10 บรรทัดแรก
  - README / package.json ที่ใกล้ที่สุด
         │
         ▼
       Rescore
         │
    ┌────┴────┐
    ▼         ▼
  >= 0.80   < 0.80
  (HIGH)    (ยังก้ำกึ่งจริง)
    │         │
    ▼         ▼
  เริ่มงาน     ค่อยถาม User
```

ระบบจะไม่ถามผู้ใช้ทันที แต่จะดึงสัญญาณบริบทแวดล้อมที่ต้นทุนต่ำมาคำนวณคะแนนใหม่ หากคะแนนขยับสู่ $\ge 0.80$ จะเริ่มทำงานทันที ช่วยลดทั้ง Token และลดภาระของผู้ใช้

---

## ถามขอบเขตก่อนเลือก Skill

เมื่อใช้บริบทที่มีแล้วแต่ confidence ยังไม่ถึง HIGH ระบบคืน `mode: CLARIFY`
พร้อม `clarification.question` หนึ่งคำถาม โดยไม่ส่ง Skill path หรือโหลดเนื้อหา Skill
ให้ถามด้วยภาษางาน เช่น “เอกสารนี้ใช้ทำเรื่องอะไร” แทนการให้ผู้ใช้เลือกชื่อ Skill
คำกว้างอย่าง “ต้องแนบอะไร”, “ไปต่อได้ไหม” และ “ควรตอบยังไง” ไม่ถือเป็นหลักฐานเฉพาะด้านด้วยตัวเอง

เมื่อได้คำตอบ adapter จะรวมคำตอบสะสมกับคำขอเดิมแล้ว route ใหม่:
`step-ai ask "ช่วยดูเอกสารนี้หน่อย ต้องแนบอะไร" --answer "เป็นใบเสร็จค่าอาหารจัดประชุม" --json`
ถ้ายังไม่ชัด ให้ถามเฉพาะข้อมูลที่ยังขาดทีละข้อโดยไม่ถามซ้ำ เมื่อชัดแล้วจึงเปิด Skill
Authority BLOCK และ scope ที่ต้องส่งต่อหรือยืนยันยังทำงานก่อน clarification

สำหรับ API เดิม `selectedSkill` และ `ranked` ยังคงแสดง candidate เพื่อการวิเคราะห์
ผู้เรียกต้องใช้ `routingMode` และ `routingContract` เป็นเกณฑ์เริ่มงาน;
ในโหมด CLARIFY ค่า `routingContract.skill` และ `skillPath` ว่าง

เมื่อหลาย Playbook ผ่านเงื่อนไขและมีหลักฐานใกล้กัน (จำนวนกลุ่มสัญญาณต่างกันไม่เกิน 1
และสัดส่วนสัญญาณต่างกันไม่เกิน 0.20) ระบบคืน `CLARIFY` พร้อม `field: playbook`
และตัวเลือกภาษางานใน `clarification.options` เช่น “แปลง TOR เป็นแผนโครงการ”
กับ “ต่อยอดบันทึกประชุมเป็นแผนงาน” โดยยังไม่เลือก Playbook หรือโหลดขั้นตอนใด

ตอบด้วยหมายเลขตามลำดับที่แสดง ข้อความตัวเลือก หรือระบุแหล่งงาน เช่น “เริ่มจากบันทึกประชุม”
ผ่าน `--answer` ได้ ระบบใช้คำตอบเพื่อแยกเส้นทาง แต่เก็บบริบทเดิมไว้สร้างผลลัพธ์และตรวจ Authority
ถ้าถามหลายรอบให้ส่งคำตอบสะสมแยกบรรทัด โดยคำตอบล่าสุดอยู่บรรทัดสุดท้าย
คำตอบที่ยังไม่แยกเส้นทาง เช่น “ทั้งสองอย่าง” จะยังถามว่างานใดควรเริ่มก่อน
Playbook ที่มีหลักฐานนำชัดเจนยังเริ่มได้ทันที

## ขอบเขตการทำงาน 3 สถานะ (3-Outcome Scope Guard)

ทุกทักษะมี Scope Guard กำกับเพื่อป้องกัน AI ทำเกินหน้าที่ โดยแบ่งผลลัพธ์เป็น 3 รูปแบบ:

1. **ALLOW**: งานอยู่ในขอบเขต (`scope.allow`) AI สามารถดำเนินการได้ทันที
2. **ESCALATE**: งานอยู่นอกขอบเขตของทักษะนี้ แต่มีทักษะอื่นรองรับ (`scope.escalate`) ส่งต่องานไปยังทักษะเป้าหมาย
3. **BLOCK / HUMAN_ONLY**: งานต้องอาศัยอำนาจตัดสินใจของมนุษย์ (`scope.human_only` เช่น อนุมัติจัดซื้อ อนุมัติวงเงิน ลงนามสัญญา) ยุติการทำงานในส่วนนั้นอย่างสุภาพ และแจ้งผู้มีอำนาจรับผิดชอบตาม `manifest/authority.yaml`

```yaml
scope:
  allow:
    - ตรวจความครบถ้วนของ TOR และขอบเขตงาน
    - จัดทำ Traceability Matrix
  escalate:
    vendor_selection:
      skill: vendor-evaluation
      description: การคัดเลือกหรือตัดสินให้คะแนนผู้ยื่นซอง
  human_only:
    legal_advice:
      role: human-legal-officer
      authority: legal-advice
      description: การวินิจฉัยข้อกฎหมายหรือความเห็นทางนิติกร
    budget_approval:
      role: afp-finance-head
      authority: budget-allocation
      description: การอนุมัติงบประมาณหรือเปลี่ยนแปลงวงเงิน
```

---

## Canonical Concept: `/ask_step`

`/ask_step` คือแนวคิดกลางสำหรับผู้ใช้ในการเรียกใช้ระบบอัตโนมัติ (แต่ละ Adapter จะแมปเข้ากับกลไกเฉพาะของเครื่องมือนั้น):
1. **Claude (Claude Code / Desktop)**: คำสั่ง `/ask_step <คำขอ>`
2. **Cursor IDE**: System Prompt Instruction & Composer Routing
3. **OpenAI Codex**: Instructions Header & Natural Language Routing

รูปแบบการแสดงผลของ Router (Routing Tag):
```text
[STeP Router] Team: AFP / QS | Process: procurement.tor | Intent: Review
✓ Active Skill: tor-review (Confidence: 0.95, HIGH Tier)
✓ Scope Guard: Active (ตรวจขอบเขต/เกณฑ์ตรวจรับ | Human-only: ไม่อนุมัติวงเงินหรือวินิจฉัยกฎหมาย)
```


## Composite Routing / Playbooks

Router แยกงานเป็น 2 แบบ:

- **Atomic** — ผลลัพธ์หลักเดียว ใช้ 5-Factor Skill Scoring ตามเดิม
- **Composite** — หลายผลลัพธ์ที่ต้อง handoff กัน และตรง signal ใน `manifest/playbooks.yaml`

Composite routing ไม่แทนที่ Skill Router แต่ทำหน้าที่เลือก sequence ก่อน จากนั้นแต่ละ step ยังใช้ Skill, Scope Guard, Mandatory Rules และ Authority เดิม

```text
Composite Request
      ↓
Playbook Detection
      ↓
Current Skill
      ↓ structured handoff
Next Skill
      ↓
Tool / Action
```

Run state เก็บได้ที่ `.step-ai/runs/<run-id>/state.json` เพื่อให้กลับมาทำงานเดิมต่อได้ โดย state ต้องไม่มี secrets/credentials ที่ไม่จำเป็น
