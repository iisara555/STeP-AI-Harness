# STeP AI Harness — Architecture Reference

> เอกสารนี้อธิบายสถาปัตยกรรมล่าสุดของ STeP AI Harness ใน repository ปัจจุบัน
>
> หลักสำคัญ: Harness เป็นชั้นกลางระหว่างพนักงานกับ AI เพื่อให้ AI เข้าใจบริบทองค์กร ใช้แหล่งอ้างอิงที่ตรวจสอบได้ รู้ขอบเขตอำนาจ และเรียกความสามารถที่เหมาะสมโดยไม่ผูกกับ AI provider รายเดียว

## 1. Architecture Layer Diagram

~~~mermaid
flowchart TB

    U[พนักงาน STeP<br/>Natural-language request]

    subgraph C1["Layer 1 — AI Client & Workspace"]
      AI[AI Client<br/>ChatGPT / Claude / Codex / Cursor / OpenCode / Windsurf / Gemini / Hermes]
      AD[Adapter / Workspace Instructions<br/>โหลดเฉพาะบริบทที่จำเป็น]
      FR[Lightweight First Run<br/>START-HERE / USER / MEMORY<br/>ไม่ scan ทั้ง repo]
    end

    subgraph C2["Layer 2 — Intent & Routing"]
      RT[Router<br/>Intent + Team + Path + File Type + Signals]
      CB[Context Budgeter<br/>compact route / selected context only]
      ATOMIC[Atomic Task<br/>เลือก 1 Skill]
      COMP[Composite Task<br/>เลือก Playbook]
    end

    subgraph C3["Layer 3 — Organization Model 6D"]
      WHO[WHO<br/>Teams / Roles / Owners]
      WHERE[WHERE<br/>Organization / Team / Context]
      WHAT[WHAT<br/>Skills / Capabilities]
      WHY[WHY<br/>Services / Objectives / Policies]
      HOW[HOW<br/>Processes / Playbooks]
      AUTH[AUTHORITY<br/>Human decision boundaries]
    end

    subgraph C4["Layer 4 — Controlled Knowledge & Domain Governance"]
      DR[Document Registry<br/>Policies / Rules / Templates / Controlled Sources]
      QL[Quality Layer v0.1<br/>ISO 9001 / Quality Policy / QP / WI / FM / Records]
      AFP[AFP Demo Source Pack<br/>STeP / CMU / National finance & procurement sources<br/>รอ AFP ยืนยัน source ภายใน]
      ORG[Organization Context<br/>Teams / Processes / Services / Roles]
    end

    subgraph X["Cross-cutting Safeguards"]
      PG[Privacy Gate<br/>Quick local scan → Auto-mask → High-risk gate]
      PROV[Source & Provenance<br/>6 provenance labels]
      HA[Human Authority<br/>approval / signing / legal / budget / procurement / QMS]
      SEC[Secret & Credential Safety<br/>no plaintext password/token/cookie/MFA]
    end

    subgraph C5["Layer 5 — Skills & Playbooks"]
      SK[45 Atomic Skills<br/>โหลดเฉพาะงานที่เกี่ยวข้อง]
      PB[4 Lightweight Playbooks<br/>TOR→Project Plan<br/>Meeting→Action Plan<br/>ISO Audit Readiness<br/>Skill→Pilot]
    end

    subgraph C6["Layer 6 — Action & Tool Execution"]
      AR[Action Registry<br/>3 executable actions]
      TOOL[Tools / Connectors / Local Runtime<br/>Google Sheets / XLSX / Browser / Files / APIs / MCP]
      GATE[Confirmation & Capability Check<br/>risk / side effect / tool availability]
    end

    subgraph C7["Layer 7 — State, Output & Learning"]
      RS[Run State v3<br/>step status / safe metadata / provenance / events]
      OUT[Output Management<br/>output/TEAM/YYYY/MM/TYPE<br/>versioned filenames]
      FB[Feedback<br/>useful / needs-fix / not-useful]
    end

    U --> AI
    AI --> AD
    AD --> FR
    FR --> RT

    RT --> WHO
    RT --> WHERE
    RT --> WHAT
    RT --> WHY
    RT --> HOW
    RT --> AUTH

    WHO --> ORG
    WHERE --> ORG
    WHY --> DR
    AUTH --> HA

    DR --> QL
    DR --> AFP
    ORG --> RT

    RT --> CB
    CB --> ATOMIC
    CB --> COMP
    ATOMIC --> SK
    COMP --> PB

    PG -.ตรวจ input/source ก่อนประมวลผล.-> RT
    PROV -.กำกับ facts/rules/assumptions/recommendations.-> SK
    PROV -.กำกับ facts/rules/assumptions/recommendations.-> PB
    HA -.บังคับขอบเขตอำนาจ.-> SK
    HA -.บังคับขอบเขตอำนาจ.-> PB
    SEC -.ใช้ร่วมทุก layer.-> AI
    SEC -.ใช้ร่วมทุก layer.-> TOOL

    SK --> GATE
    PB --> GATE
    GATE --> AR
    AR --> TOOL

    SK --> RS
    PB --> RS
    TOOL --> RS
    RS --> OUT
    RS --> FB
    FB -.ใช้ปรับ Router / Skill / Source Mapping.-> RT
~~~

## 2. ความหมายของแต่ละ Layer

| Layer | หน้าที่ | Source หลักใน repo |
| --- | --- | --- |
| AI Client & Workspace | ทำให้ Harness ใช้งานได้กับ AI หลายค่าย และโหลดบริบทแบบ progressive disclosure | START-HERE.md, adapters, generated instruction files |
| Intent & Routing | เลือกทีม/Skill/Playbook แบบ local deterministic และสร้าง compact context contract; Context Budgeter เป็น implementation mechanism ภายใน layer นี้ | manifest/router-index.yaml, src/modules/router/, src/modules/context-budget/ |
| Organization Model 6D | โมเดลองค์กร 6 มิติ: WHO / WHERE / WHAT / WHY / HOW / AUTHORITY | manifest/teams.yaml, manifest/processes.yaml, manifest/services.yaml, manifest/authority.yaml, manifest/organization.yaml |
| Controlled Knowledge & Domain Governance | เก็บ Source ที่ AI ใช้อ้างอิง พร้อม owner/status/version เท่าที่ตรวจสอบได้ | manifest/documents.yaml, docs/quality-layer.md, AFP demo docs |
| Cross-cutting Safeguards | Privacy, provenance, human authority และ credential safety ที่ครอบหลาย layer | rules/data-classification.md, manifest/provenance.yaml, manifest/authority.yaml, rules/secret-safety.md |
| Skills & Playbooks | Atomic task ใช้ Skill; composite task ใช้ Playbook ที่เรียง Skill แบบ lightweight | manifest/skills.yaml, manifest/playbooks.yaml |
| Action & Tool Execution | แยก “ความรู้/วิธีทำงาน” ออกจาก “การลงมือทำจริง” และตรวจ risk/confirmation/tool availability | manifest/actions.yaml, action specs |
| State, Output & Learning | เก็บ run state แบบปลอดภัย, output reference, provenance และ feedback เพื่อนำไปปรับระบบ | .step-ai/runs/, output/, feedback flow |

### Context Budgeter ไม่ใช่ Layer ใหม่

Context Budgeter อยู่ภายใน Intent & Routing เพื่อควบคุมว่าอะไรควรเข้า model context โดย **ไม่เปลี่ยน 6D, Skills, Playbooks, Source Governance หรือ Authority**

หลักคือ local router อ่าน registry ได้ แต่ model เห็นเพียง compact routing contract, selected Skill, mandatory references และ relevant source excerpts ที่จำเป็น

## 3. Request Lifecycle

~~~text
พนักงานพิมพ์งาน
      ↓
Lightweight First Run / Workspace Context
      ↓
Privacy Quick Check (เมื่อมีข้อมูล/เอกสาร)
      ↓
Router
      ↓
Compact Routing Contract + Context Budget
      ↓
ตรวจ Team + Intent + 6D context
      ↓
Atomic?
 ├─ ใช่ → Skill
 └─ ไม่ใช่ → Playbook → Skill ทีละขั้น
      ↓
Resolve Source / Provenance
      ↓
Human Authority Check
      ↓
Action Registry (เฉพาะเมื่อมีการลงมือทำจริง)
      ↓
Tool / Connector / Local Runtime
      ↓
Output + Run State + Feedback
~~~

## 4. Organization Model 6D

6D เป็นโมเดลของ **องค์กร** ไม่ใช่ layer ของระบบคอมพิวเตอร์ และไม่ควรเพิ่ม Dimension ใหม่เพียงเพราะมี capability ใหม่

| Dimension | คำถามที่ตอบ | ตัวอย่าง |
| --- | --- | --- |
| WHO | ใครเป็นเจ้าของ/ผู้รับผิดชอบ/ผู้อนุมัติ | AFP, QS, Process Owner, Approver |
| WHERE | งานนี้อยู่ในบริบทส่วนใด | ทีม, หน่วยงาน, โครงการ, service context |
| WHAT | AI ต้องใช้ความสามารถอะไร | TOR review, receipt audit, meeting summary |
| WHY | ทำงานนี้เพื่ออะไร/ภายใต้นโยบายใด | Quality Policy, service objective, organization rule |
| HOW | กระบวนการหรือ flow เป็นอย่างไร | Process, Skill, Playbook |
| AUTHORITY | ใครมีอำนาจตัดสินขั้นสุดท้าย | Procurement Committee, AFP Head, QMR, Authorized Signatory |

## 5. Cross-cutting Safeguards

### Privacy Gate

Privacy Gate ไม่ใช่ Layer ที่บังคับให้ทุกงานช้า แต่เป็น safeguard แบบ fast path:

~~~text
Quick Local Scan
  ├─ Public/Internal → ผ่านหรือปิดบังเท่าที่จำเป็น
  ├─ Restricted → Auto-mask ก่อนส่ง AI
  └─ Sensitive/High Risk → Human Confirmation / Block external AI
~~~

หลัก Pilot:
- regex/heuristic local ก่อน model
- ไม่ OCR PDF/รูปภาพทั้งชุดอัตโนมัติ
- cache ผล scan ตาม hash
- Run State เก็บเฉพาะ privacy metadata ไม่เก็บ raw PII
- query/feedback ที่ persist ต้อง redact ก่อน

### Source & Provenance

ใช้ provenance 6 ประเภท:
SOURCE_FACT, DERIVED_FACT, USER_INPUT, PLANNING_ASSUMPTION, ORGANIZATION_RULE และ AI_RECOMMENDATION

เป้าหมายคือไม่ให้ AI นำ assumption หรือ recommendation ไปเสนอเป็นกฎ/ข้อเท็จจริง

### Human Authority

AI ช่วยเตรียม ตรวจ เปรียบเทียบ และเสนอข้อมูลได้ แต่ authority ต่อไปนี้ต้องเป็นมนุษย์ตาม manifest/authority.yaml:
- procurement approval / vendor selection
- budget allocation / disbursement approval
- binding legal advice
- official signing
- ISO/QMS enactment and conformity decisions
- policy waiver
- HR performance evaluation
- brand alteration

## 6. Quality Layer v0.1

Quality Layer เป็น controlled-source layer ที่เชื่อมกับ 6D และ Skills เดิม ไม่ใช่ Dimension ใหม่

~~~text
ISO 9001:2015
      ↓
STeP Quality Policy V2
      ↓
Quality Manual              ← missing source
      ↓
Quality Procedures
      ↓
WI / SD / FM
      ↓
Quality Records / Evidence

Master Document List        ← missing source
      └─ ใช้ยืนยัน Current / Superseded / Obsolete
~~~

สถานะปัจจุบัน:
- ISO 9001:2015 และ STeP Quality Policy V2 ลงทะเบียนแล้ว
- QP ที่ได้รับถูก mark provided-unverified
- Quality Manual และ Master Document List เป็น known gaps
- Existing QMS Skills map กับ Source ที่เกี่ยวข้องแล้ว
- มี Pilot Smoke Test 15 เคส

## 7. AFP Finance & Procurement Foundation

ขณะนี้ AFP อยู่ในสถานะ **Demo Source Pack / Foundation Preparation** ยังไม่ถือว่า internal source ทั้งหมดได้รับการยืนยันแล้ว

แหล่งที่ใช้ใน Demo:
- STeP OIT / procurement references
- แหล่งส่วนกลางของมหาวิทยาลัยเชียงใหม่
- กฎหมายและระเบียบระดับประเทศ/กระทรวง
- Source ภายใน AFP จะถูกเพิ่มหลัง AFP ยืนยัน

4 Demo use cases:
1. ตรวจใบเสร็จ/เอกสารการเงินก่อนส่ง AFP
2. ตรวจ TOR ก่อนส่ง AFP
3. ช่วยบอกว่า transaction นี้ต้องเตรียมเอกสารอะไร
4. อธิบายเหตุผลที่เอกสารถูกตีกลับและเปรียบเทียบกับเคสก่อน

หลักสำคัญ:
- case เก่า = historical reference ไม่ใช่ rule
- rule / evidence / judgment ต้องแยกจากกัน
- AI ไม่อนุมัติเบิก ไม่เลือกผู้ชนะ และไม่ override การตัดสินของ AFP

## 8. Skills, Playbooks และ Actions

ณ snapshot ปัจจุบัน:
- 45 Skills
- 4 Playbooks
- 3 executable Actions
- 6 provenance types
- 22 teams ใน 5 AI routing clusters

ความสัมพันธ์:

~~~text
Skill
= ความสามารถเฉพาะงาน

Playbook
= ลำดับหลาย Skill สำหรับงาน composite

Action
= การลงมือทำกับ Tool/ระบบจริง
~~~

ตัวอย่าง:

~~~text
TOR → Project Plan

tor-review                Skill
      ↓
project-plan              Skill
      ↓
spreadsheet-project-plan  Action
      ↓
Google Sheets / XLSX      Tool
~~~

## 9. Run State v3

Run State ใช้เพื่อ resume งานหลายขั้น ไม่ใช่ workflow engine กลางขององค์กร

ตำแหน่ง:
.step-ai/runs/<run-id>/state.json

เก็บ:
- current step
- completed steps
- source/provenance metadata
- privacy-safe metadata
- output references
- structured handoffs สำหรับ step ถัดไป
- token telemetry (estimate/actual แยกกัน)
- events
- feedback

ไม่ควรเก็บ:
- password/token/cookie/MFA
- raw PII ที่ไม่จำเป็น
- secrets
- สำเนาเอกสารทั้งฉบับโดยไม่จำเป็น

## 10. Context Efficiency

การลด token ใช้ progressive disclosure โดยไม่ลด governance:

- router registry ถูกประมวลผล local และไม่ส่งทั้งไฟล์เข้า model เมื่อ local runtime พร้อม
- selected Skill เท่านั้นที่เข้าสู่ working context
- mandatory rules เท่านั้นที่ถูก resolve โดย default
- source ใช้ relevant excerpt budget
- Privacy/Authority resolve local ก่อนเท่าที่ทำได้ แล้วส่งเฉพาะ compact result
- Playbook ใช้ structured handoff ตาม consumes/produces แทน conversation replay
- Run State เก็บ estimate token telemetry และรองรับ actual usage จาก provider เมื่อมีข้อมูลจริง

รายละเอียด: `docs/context-efficiency.md`

## 11. สิ่งที่ Architecture นี้ตั้งใจไม่ทำใน Pilot

ยังไม่สร้าง:
- organization-wide vector database
- full knowledge graph
- drag-and-drop workflow designer
- multi-agent orchestration ขนาดใหญ่
- central control-plane dashboard
- autonomous cross-system agents
- complex RBAC platform

ให้เพิ่มเมื่อ usage จริงแสดงว่าจำเป็นเท่านั้น
