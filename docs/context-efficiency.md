# Context Efficiency & Token Budgeting

> เป้าหมาย: ลด token overhead ของ STeP AI Harness โดยไม่เปลี่ยน Organization Model 6D, Skill/Playbook architecture, Human Authority, Privacy Gate หรือ Source/Provenance

Context Efficiency เป็น **implementation mechanism ภายใน Routing / Context Assembly** ไม่ใช่ Dimension ใหม่และไม่ใช่ Layer ใหม่ขององค์กร

## หลักการ

```text
User Request
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
```

สิ่งที่ตั้งใจไม่ส่งเข้า model context:
- router-index.yaml ทั้งไฟล์
- inventory ของ 43 Skills
- Rules ที่ไม่เกี่ยวข้อง
- optional templates/examples โดยอัตโนมัติ
- conversation/source จาก Playbook step ก่อนหน้าทั้งชุด

## 1. Zero-token Router Registry

Router ยังอ่าน `manifest/router-index.yaml` แบบ local ได้ตามปกติ แต่ผลที่ส่งต่อให้ AI เป็น compact contract เช่น:

```json
{
  "routingEngine": "local-deterministic",
  "routerRegistrySentToModel": false,
  "mode": "SKILL",
  "team": "afp",
  "skill": "tor-review",
  "skillPath": "skills/pm/tor-review/SKILL.md",
  "process": "procurement.tor",
  "mandatoryReferences": [
    {"id": "human-approval-rule", "path": "rules/human-approval.md"}
  ],
  "authority": {"status": "ALLOW"}
}
```

สำหรับ AI client/runtime ที่เรียก CLI ได้ ให้ใช้:

```bash
step-ai ask "ช่วยตรวจ TOR นี้ก่อนส่ง AFP" --json
```

แทนการให้ model เปิด Router Registry ทั้งไฟล์

## 2. Context Budgets

Default budget เป็น guardrail ไม่ใช่การตัดเนื้อหาแบบ blind:

| Component | Default budget |
| --- | ---: |
| Startup | 800 tokens |
| Routing result | 300 |
| Selected Skill | 2,500 |
| Mandatory Rules | 800 |
| Relevant Sources | 3,000 |
| Structured Handoff | 1,500 |
| Governance metadata | 200 |

หาก component เกิน budget ระบบต้อง mark `overBudget: true` เพื่อให้ runtime ใช้ selective loading / source excerpt แทนการแกล้งทำว่า context มีขนาดพอดี

## 3. Token Telemetry

ถ้า AI provider ส่ง usage จริงกลับมา ให้เก็บ actual token usage

ถ้าไม่มี ให้เก็บเพียง estimate ที่ระบุชัดเจนว่าเป็น estimate:

```json
{
  "usage": {
    "accounting": "estimated",
    "estimateMethod": "char-estimate-v1",
    "inputTokens": null,
    "outputTokens": null,
    "taskData": {
      "chars": 120,
      "estimatedTokens": 48,
      "actualTokens": null
    },
    "harnessContext": {
      "estimatedTokens": 2100,
      "actualTokens": null
    }
  }
}
```

ห้ามนำ estimate ไปแสดงเป็น provider-reported token usage

เมื่อ provider มีข้อมูลจริง สามารถ update Run State ด้วย actual input/output tokens ภายหลังได้

## 4. Structured Playbook Handoff

Playbook ยังคงทำงานทีละ Skill ตามเดิม แต่แต่ละ step สร้าง compact handoff เพิ่มจาก full output:

```text
Step 1
Source + Skill
    ↓
Full Output เก็บใน Run State
    ↓
Structured Handoff <= budget
    ↓
Step 2 รับเฉพาะ consumes ที่จำเป็น
```

ตัวอย่าง:

```json
{
  "fromStep": "review-source",
  "producedKeys": [
    "source-facts",
    "requirements",
    "deliverables"
  ],
  "data": {
    "source-facts": [...],
    "requirements": [...],
    "deliverables": [...]
  }
}
```

Full output ยังเก็บไว้เพื่อ traceability/resume แต่ **ไม่ใช่สิ่งที่ต้อง replay เข้า model ทุก step**

## 5. Source Budget

Source/Document Registry เดิมไม่เปลี่ยน การ optimize ทำที่ retrieval:

```text
Task
 ↓
Relevant issue
 ↓
Relevant Source
 ↓
Relevant section/excerpt
 ↓
AI
```

ไม่ส่งกฎหมาย/QP/TOR ทั้งชุดเมื่อ task ต้องใช้เพียงบางส่วน เว้นแต่เนื้อหาทั้งฉบับจำเป็นจริง

## 6. Privacy & Authority

Privacy Gate และ Human Authority ควร resolve แบบ local ก่อนเท่าที่ทำได้

AI ควรเห็นผล compact เช่น:

```text
Privacy: restricted / redaction applied
Authority: procurement-approval / human-only
```

แทนการโหลด policy matrix ทั้งฉบับทุก request

## 7. KPI สำหรับ Pilot

เป้าหมายปัจจุบัน:

- Full router registry sent to model = **0**
- Full Skill inventory sent to model = **0**
- Unrelated Rules loaded = **0**
- Atomic routing contract <= **300 estimated tokens**
- Playbook handoff <= **1,500 estimated tokens/step**
- Atomic Harness overhead เป้าหมายระยะถัดไป <= **3,000 tokens**
- Token reduction ต้องไม่ลด Source Traceability, Privacy Safety หรือ Human Authority

## 8. สิ่งที่ยังไม่ทำ

ยังไม่เพิ่ม:
- Vector DB ทั้งองค์กร
- Dedicated routing LLM
- Semantic cache service
- Multi-agent routing
- Knowledge Graph
- Central context server

ให้เก็บ telemetry จาก usage จริงก่อน แล้ว optimize Skill/Source ที่มี overhead สูงที่สุดตามข้อมูล
